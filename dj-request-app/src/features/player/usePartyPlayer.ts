import { useCallback, useMemo, useRef, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useEventRequests } from '../requests/useEventRequests'
import { getErrorMessage } from '../../utils/errors'
import { resolveVideo, rejectVideo } from '../../services/player/resolveVideo'
import { PlayerError, type VideoMatch } from '../../services/player/youtubeSearch'
import { useYouTubePlayer } from './useYouTubePlayer'
import type { SongRequest } from '../../types/domain'

export type PlayerStatus =
  | 'idle'
  | 'resolving'
  | 'playing'
  | 'paused'
  | 'empty'
  | 'error'

export interface PartyPlayerState {
  hostRef: React.RefObject<HTMLDivElement | null>
  status: PlayerStatus
  /** The song on the speakers right now. Not in `queue` — it has left it. */
  current: SongRequest | null
  /** Which video was chosen for it, so the DJ can see the pick. */
  match: VideoMatch | null
  queue: SongRequest[]
  loading: boolean
  /** Set when playback has halted and needs the DJ. */
  failure: string | null
  start: () => void
  skip: () => void
  togglePause: () => void
  /** Step to the next-best video for the current song. Costs no quota. */
  wrongSong: () => void
}

/**
 * How many songs may fail in a row before the player gives up and says so.
 *
 * Silence is worse than a wrong song, so a track that cannot be found is
 * skipped rather than left sitting there — but a queue that is failing
 * wholesale (the key died, YouTube is unreachable) would otherwise race through
 * every request in seconds, marking them all played. This is where automatic
 * recovery stops and the DJ is told.
 */
const MAX_CONSECUTIVE_SKIPS = 3

/**
 * The queue, playing itself.
 *
 * Starting a song is deliberately the *existing* now-playing write rather than
 * anything new: `setNowPlaying` already retires the request from the queue and
 * tells every guest what is on. So the player is not a parallel source of truth
 * running alongside the app — it drives the same state the DJ's manual buttons
 * drive, which is why a guest's screen updates from it for free and why the DJ
 * can take over by hand at any point without the two disagreeing.
 *
 * Playing and advancing call each other: a song that cannot be found advances
 * the queue, and advancing plays a song. The cycle is broken with a ref rather
 * than by merging them, so each stays a single readable job.
 */
export function usePartyPlayer(eventId: string): PartyPlayerState {
  const service = useService()
  const toast = useToast()
  const { refresh } = useDjEvent()
  const { requests, loading, reload } = useEventRequests(eventId)

  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [current, setCurrent] = useState<SongRequest | null>(null)
  const [match, setMatch] = useState<VideoMatch | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const queue = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'queued')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [requests],
  )

  /**
   * The queue as it stands *now*, readable from a callback created several
   * songs ago. The end-of-video event fires outside React's render cycle and
   * would otherwise advance using the queue as it looked when playback started
   * — losing anything the DJ or a guest has added since.
   */
  const queueRef = useRef<SongRequest[]>(queue)
  queueRef.current = queue

  const currentRef = useRef<SongRequest | null>(null)
  currentRef.current = current

  /** Stops the end-of-song event racing an already-running advance. */
  const busyRef = useRef(false)
  const skipsRef = useRef(0)

  /**
   * Late-bound hooks into callbacks defined further down. The player is built
   * before them because it supplies `play`, and they need it.
   */
  const advanceRef = useRef<(finished: SongRequest | null) => void>(() => {})
  const endedRef = useRef<() => void>(() => {})
  const unplayableRef = useRef<() => void>(() => {})

  const { hostRef, loadError, play, pause, resume, stop } = useYouTubePlayer({
    onEnded: () => endedRef.current(),
    onUnplayable: () => unplayableRef.current(),
  })

  const halt = useCallback((message: string) => {
    busyRef.current = false
    setStatus('error')
    setFailure(message)
  }, [])

  /**
   * Put one song on. Resolution happens first, so a song that cannot be found
   * is never announced to the room as playing.
   */
  const playRequest = useCallback(
    async (request: SongRequest) => {
      busyRef.current = true
      setStatus('resolving')
      setFailure(null)
      setCurrent(request)
      setMatch(null)

      let video: VideoMatch
      try {
        video = await resolveVideo(request)
      } catch (err) {
        busyRef.current = false
        /**
         * One missing song should not end the night, but a key or quota problem
         * will hit every song equally — and skipping the entire queue one
         * failure at a time, marking each played on the way, is the worst
         * possible response to it.
         */
        if (err instanceof PlayerError && err.failure === 'not_found') {
          skipsRef.current += 1
          toast.error(`Skipping ${request.title} — not on YouTube.`)
          advanceRef.current(request)
        } else {
          halt(getErrorMessage(err))
        }
        return
      }

      try {
        // The same write the manual "Play next song" button makes: it retires
        // the request from the queue and tells the guests what is on.
        await service.setNowPlaying(eventId, {
          title: request.title,
          artist: request.artist,
          sourceRequestId: request.id,
          artworkUrl: request.artworkUrl,
        })
        await Promise.all([refresh(), reload()])
      } catch (err) {
        busyRef.current = false
        halt(getErrorMessage(err))
        return
      }

      busyRef.current = false
      skipsRef.current = 0
      setMatch(video)
      setStatus('playing')
      play(video.videoId)
    },
    [service, eventId, refresh, reload, toast, halt, play],
  )

  /** Move on from `finished` to whatever is at the head of the queue now. */
  const advance = useCallback(
    (finished: SongRequest | null) => {
      if (busyRef.current) return

      if (skipsRef.current >= MAX_CONSECUTIVE_SKIPS) {
        halt(
          'Several songs in a row could not be played. Check the connection, or the YouTube key in Event settings.',
        )
        return
      }

      // `finished` has usually left the queue already, but a reload may not have
      // landed yet — so it is excluded explicitly rather than assumed gone.
      const next = queueRef.current.find((r) => r.id !== finished?.id)
      if (!next) {
        setStatus('empty')
        setCurrent(null)
        setMatch(null)
        return
      }

      void playRequest(next)
    },
    [halt, playRequest],
  )
  advanceRef.current = advance

  endedRef.current = () => {
    skipsRef.current = 0
    advance(currentRef.current)
  }

  /**
   * The video refused to play in an embed after all. The search asks YouTube to
   * exclude these, so reaching here means that answer was stale — step to the
   * next candidate, which is free, before giving up on the song.
   */
  unplayableRef.current = () => {
    const song = currentRef.current
    if (!song) return

    const alternative = rejectVideo(song)
    if (alternative) {
      setMatch(alternative)
      play(alternative.videoId)
      return
    }

    skipsRef.current += 1
    toast.error(`Skipping ${song.title} — YouTube won’t play it here.`)
    advance(song)
  }

  const start = useCallback(() => {
    const next = queueRef.current[0]
    if (!next) {
      setStatus('empty')
      return
    }
    skipsRef.current = 0
    void playRequest(next)
  }, [playRequest])

  const skip = useCallback(() => {
    stop()
    skipsRef.current = 0
    busyRef.current = false
    advance(currentRef.current)
  }, [advance, stop])

  const togglePause = useCallback(() => {
    if (status === 'playing') {
      pause()
      setStatus('paused')
    } else if (status === 'paused') {
      resume()
      setStatus('playing')
    }
  }, [status, pause, resume])

  const wrongSong = useCallback(() => {
    const song = currentRef.current
    if (!song) return

    const alternative = rejectVideo(song)
    if (!alternative) {
      toast.error('No other versions to try. Skip it, or play it yourself.')
      return
    }
    setMatch(alternative)
    play(alternative.videoId)
    setStatus('playing')
  }, [play, toast])

  return {
    hostRef,
    status,
    current,
    match,
    queue,
    loading,
    // A player script that never loaded is a failure like any other, and the
    // screen has one place to show one.
    failure: failure ?? loadError,
    start,
    skip,
    togglePause,
    wrongSong,
  }
}

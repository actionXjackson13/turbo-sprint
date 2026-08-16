import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PLAYER_STATE,
  isEmbedRefusal,
  loadYouTubeApi,
  type YouTubePlayer,
} from './youtubeApi'

interface Options {
  /** A song finished on its own. The cue to advance the queue. */
  onEnded: () => void
  /**
   * The video cannot play here — embedding forbidden, taken down, region
   * locked. Distinct from ending, because the song did not happen.
   */
  onUnplayable: (code: number) => void
}

interface PlayerHandle {
  /** Attach to an empty element; the iframe is built inside it. */
  hostRef: React.RefObject<HTMLDivElement | null>
  ready: boolean
  /** Set when the player script itself could not be loaded. */
  loadError: string | null
  playing: boolean
  /** Seconds into the current song, and how long it is. Both 0 when idle. */
  position: number
  duration: number
  play: (videoId: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

/**
 * Drives one embedded YouTube player for the life of the screen.
 *
 * The player is built once and then fed videos, rather than being torn down and
 * rebuilt per song. That is not a micro-optimisation: a browser grants
 * permission to play audio to a *player instance* on the strength of a user's
 * tap, and a fresh instance created between songs would not inherit it. The
 * first song would play and every one after it would silently refuse. Keeping
 * the instance is what makes the queue advance unattended.
 */
export function useYouTubePlayer({ onEnded, onUnplayable }: Options): PlayerHandle {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)

  /**
   * Held in refs so a re-render with new closures does not tear down a playing
   * player. The effect below must run exactly once per mount.
   */
  const endedRef = useRef(onEnded)
  const unplayableRef = useRef(onUnplayable)
  endedRef.current = onEnded
  unplayableRef.current = onUnplayable

  /**
   * A video asked for before the player finished building. Without this the
   * DJ's first tap is swallowed — the tap that also grants audio permission —
   * and the set starts with a dead button.
   */
  const pendingRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // The constructor replaces its host with an iframe, so it gets a child of
    // our own element rather than the element React is managing.
    const mount = document.createElement('div')
    hostRef.current?.appendChild(mount)

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return

        playerRef.current = new YT.Player(mount, {
          playerVars: {
            // Without this iOS takes the video fullscreen the moment it plays,
            // burying the queue behind it.
            playsinline: 1,
            // Nothing here is a viewing experience; suppress the furniture.
            controls: 0,
            modestbranding: 1,
            rel: 0,
            disablekb: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return
              setReady(true)
              const queued = pendingRef.current
              if (queued) {
                pendingRef.current = null
                playerRef.current?.loadVideoById(queued)
              }
            },
            onStateChange: (event) => {
              if (cancelled) return
              setPlaying(event.data === PLAYER_STATE.PLAYING)
              if (event.data === PLAYER_STATE.ENDED) endedRef.current()
            },
            onError: (event) => {
              if (cancelled) return
              if (isEmbedRefusal(event.data)) unplayableRef.current(event.data)
            },
          },
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Could not load the YouTube player',
        )
      })

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy()
      } catch {
        // Already gone, or never built. Nothing to release.
      }
      playerRef.current = null
      mount.remove()
      setReady(false)
      setPlaying(false)
    }
  }, [])

  /**
   * Where we are in the song.
   *
   * Polled, because the IFrame API has no time-update event — it will tell you
   * that playback started and that it ended, and nothing in between. Once a
   * second is enough for a clock a DJ glances at, and the interval only runs
   * while something is actually playing so a paused or idle bar costs nothing.
   */
  useEffect(() => {
    if (!playing) return

    const read = () => {
      const player = playerRef.current
      if (!player) return
      try {
        setPosition(player.getCurrentTime())
        // A live stream reports 0; so does a video still opening. Either way
        // there is no length to count down from, and 0 is how the bar knows.
        setDuration(player.getDuration())
      } catch {
        // The player was torn down between the tick and the read.
      }
    }

    read()
    const timer = setInterval(read, 1_000)
    return () => clearInterval(timer)
  }, [playing])

  const play = useCallback((videoId: string) => {
    // Zeroed straight away rather than left showing the last song's clock for
    // the second it takes the next one to report its own.
    setPosition(0)
    setDuration(0)

    const player = playerRef.current
    if (!player) {
      pendingRef.current = videoId
      return
    }
    player.loadVideoById(videoId)
  }, [])

  const pause = useCallback(() => playerRef.current?.pauseVideo(), [])
  const resume = useCallback(() => playerRef.current?.playVideo(), [])
  const stop = useCallback(() => {
    playerRef.current?.stopVideo()
    setPlaying(false)
    setPosition(0)
    setDuration(0)
  }, [])

  return {
    hostRef,
    ready,
    loadError,
    playing,
    position,
    duration,
    play,
    pause,
    resume,
    stop,
  }
}

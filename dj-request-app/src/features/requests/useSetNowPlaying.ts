import { useCallback, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { findQueuedMatch } from './nowPlayingMatch'
import { getErrorMessage } from '../../utils/errors'
import type { SongRequest } from '../../types/domain'

export interface NowPlayingChoice {
  title: string
  artist: string
  /** Catalogue id when it came from search. */
  id?: string | null
  artworkUrl?: string | null
}

/**
 * Telling the room what is on, for a song that need not be in the queue.
 *
 * Shared by the two screens a DJ actually stands on — the control panel and the
 * queue — because in own-decks mode this is the single most-pressed control of
 * the night, and making them walk to one particular tab to reach it would be
 * the same mistake as only ever being able to name `queue[0]`.
 *
 * The queue is passed in rather than fetched: both callers already have it
 * loaded and sorted, and refetching here would race their own reload.
 */
export function useSetNowPlaying(
  eventId: string,
  queue: SongRequest[],
  afterChange: () => Promise<unknown>,
) {
  const service = useService()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const choose = useCallback(
    async (song: NowPlayingChoice) => {
      // A song the room asked for is still the room's song when it gets played
      // out of order, so the matched request rides along and the existing write
      // retires it.
      const match = findQueuedMatch(queue, song)
      setSaving(true)
      try {
        await service.setNowPlaying(eventId, {
          title: song.title,
          artist: song.artist,
          sourceRequestId: match?.id ?? null,
          // The search result's cover when there is one, the matched request's
          // otherwise — so a typed-in title still gets artwork if the room
          // already asked for that song.
          artworkUrl: song.artworkUrl ?? match?.artworkUrl ?? null,
        })
        await afterChange()
        setOpen(false)
        toast.success(
          match
            ? `Now playing ${song.title} — ${match.guestDisplayName}’s request is ticked off.`
            : `Now playing ${song.title}`,
        )
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setSaving(false)
      }
    },
    [afterChange, eventId, queue, service, toast],
  )

  return { open, saving, choose, ask: () => setOpen(true), close: () => setOpen(false) }
}

import { useCallback } from 'react'
import { useService } from '../../hooks/useService'
import { queueOrderRoomFirst } from './queueOrdering'

/**
 * Put the queue back in its canonical order: the room's songs, then the DJ's.
 *
 * Called after anything lands in the queue, rather than each insert being
 * trusted to place itself. Every path that adds a song is a path that can get
 * this wrong, and one already had — a vote winner sent to the queue went to the
 * back like anything else, behind however much filler was sitting there, which
 * is a strange fate for the one song the whole room voted on.
 *
 * Idempotent, and silent when nothing needs moving: it compares against what is
 * already stored and only writes when the order actually differs, so calling it
 * on every insert costs a read and usually nothing else.
 */
export function useEnforceQueueOrder(eventId: string): () => Promise<void> {
  const service = useService()

  return useCallback(async () => {
    const queued = await service.listSongRequests(eventId, {
      statuses: ['queued'],
    })
    if (queued.length < 2) return

    const desired = queueOrderRoomFirst(queued)
    const current = [...queued]
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
      .map((r) => r.id)

    if (desired.join() === current.join()) return
    await service.reorderQueue(eventId, desired)
  }, [service, eventId])
}

import { useCallback } from 'react'
import { useService } from '../../hooks/useService'
import { mainCountOf, queueOrderMainFirst } from './queueOrdering'

/**
 * Put the queue back in its canonical order: the main half, then the backdrop.
 *
 * Called after anything lands in the queue, rather than each insert being
 * trusted to place itself. A new row is written at the very back of the whole
 * queue, which for anything in the main half is the wrong place — this moves it
 * to the end of its own half instead, behind the requests already waiting and
 * ahead of the entire set.
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

    const desired = queueOrderMainFirst(queued)
    const current = [...queued]
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
      .map((r) => r.id)

    if (desired.join() === current.join()) return
    // The halves are unchanged — only the numbering within them — so the count
    // is passed through as it already stands.
    await service.reorderQueue(eventId, desired, mainCountOf(queued))
  }, [service, eventId])
}

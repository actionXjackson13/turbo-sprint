import { useCallback, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { queueOrderWithRequestAhead } from './queueOrdering'
import type { SongRequest } from '../../types/domain'

export interface QueueRequestState {
  /** Queues a request, ahead of the DJ's own songs. */
  queueRequest: (request: SongRequest) => Promise<void>
  /** The request currently being queued, for disabling its control. */
  pendingId: string | null
}

/**
 * "Add to queue", with the room's songs kept in front of the DJ's.
 *
 * Setting the status alone used to be enough, because everything in the queue
 * had been asked for and the back of the queue was a fair place to land. Sets
 * changed that: the DJ can now put thirty songs in at once, and a request
 * appended after them is a request that never plays.
 *
 * Composed from the two operations that already exist — set the status, then
 * reorder — rather than adding a method to `DataService`, so nothing new has to
 * be implemented against Postgres and the reorder stays a single authoritative
 * write. The queue is re-read rather than taken from the caller's render:
 * another device may have queued something since this screen last loaded.
 */
export function useQueueRequest(
  eventId: string,
  onDone: () => Promise<void> | void,
): QueueRequestState {
  const service = useService()
  const toast = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const queueRequest = useCallback(
    async (request: SongRequest) => {
      setPendingId(request.id)
      try {
        if (request.status !== 'queued') {
          await service.updateRequestStatus(request.id, 'queued')
        }

        const queued = await service.listSongRequests(eventId, {
          statuses: ['queued'],
        })
        const order = queueOrderWithRequestAhead(queued, request.id)

        // Only worth a write when it actually changes something — a queue with
        // no DJ songs in it is already in the right order.
        const current = queued
          .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
          .map((r) => r.id)
        if (order.join() !== current.join()) {
          await service.reorderQueue(eventId, order)
        }

        await onDone()
        toast.success(`${request.title} queued.`)
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setPendingId(null)
      }
    },
    [service, eventId, onDone, toast],
  )

  return { queueRequest, pendingId }
}

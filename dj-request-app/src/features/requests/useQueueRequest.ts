import { useCallback, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { useEnforceQueueOrder } from './useEnforceQueueOrder'
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
  const enforceOrder = useEnforceQueueOrder(eventId)

  const queueRequest = useCallback(
    async (request: SongRequest) => {
      setPendingId(request.id)
      try {
        if (request.status !== 'queued') {
          await service.updateRequestStatus(request.id, 'queued')
        }

        // The rule lives in one place now, applied to the whole queue rather
        // than to this one song — so it holds however the song got here.
        await enforceOrder()

        await onDone()
        toast.success(`${request.title} queued.`)
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setPendingId(null)
      }
    },
    [service, enforceOrder, onDone, toast],
  )

  return { queueRequest, pendingId }
}

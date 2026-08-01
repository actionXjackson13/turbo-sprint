import { useCallback, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import type { SongRequest } from '../../types/domain'

/**
 * The queue's ids with one request moved to the front, everything else keeping
 * its relative order. Pure, so the ordering is testable without a component.
 */
export function queueOrderWithFirst(
  queued: SongRequest[],
  requestId: string,
): string[] {
  const rest = queued
    .filter((r) => r.id !== requestId)
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
  return [requestId, ...rest.map((r) => r.id)]
}

export interface PlayNextState {
  /** Queues the request if needed, then moves it to the front of the queue. */
  playNext: (request: SongRequest) => Promise<void>
  /** The request currently being moved, for disabling its control. */
  pendingId: string | null
}

/**
 * "Play this one next."
 *
 * Queueing a request appends it to the back, which is the wrong end when a DJ
 * spots the song the room wants right now. This composes the two existing
 * operations — set the status, then reorder — rather than adding a method to
 * `DataService`, so nothing new has to be implemented against Postgres and the
 * reorder stays a single authoritative write.
 *
 * The queue is re-read rather than taken from the caller's render: another
 * device may have queued something since this screen last loaded, and writing
 * a stale ordering back would silently drop it to the end.
 */
export function usePlayNext(
  eventId: string,
  onDone: () => Promise<void> | void,
): PlayNextState {
  const service = useService()
  const toast = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const playNext = useCallback(
    async (request: SongRequest) => {
      setPendingId(request.id)
      try {
        if (request.status !== 'queued') {
          await service.updateRequestStatus(request.id, 'queued')
        }

        const queued = await service.listSongRequests(eventId, {
          statuses: ['queued'],
        })
        await service.reorderQueue(
          eventId,
          queueOrderWithFirst(queued, request.id),
        )

        await onDone()
        toast.success(`${request.title} plays next.`)
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setPendingId(null)
      }
    },
    [service, eventId, onDone, toast],
  )

  return { playNext, pendingId }
}

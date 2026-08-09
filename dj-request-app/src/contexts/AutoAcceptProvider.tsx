import type { ReactNode } from 'react'
import { AutoAcceptContext } from './autoAcceptContext'
import { useEventRequests } from '../features/requests/useEventRequests'
import { useQueueRequest } from '../features/requests/useQueueRequest'
import { useAutoAccept } from '../features/requests/useAutoAccept'
import { useService } from '../hooks/useService'
import { useCallback } from 'react'
import type { SongRequest } from '../types/domain'

/**
 * Keeps auto accept running for the whole of a DJ's event, above the router
 * outlet — so a DJ reordering the queue or running a vote still has requests
 * taken as they arrive.
 */
export function AutoAcceptProvider({
  eventId,
  children,
}: {
  eventId: string
  children: ReactNode
}) {
  const service = useService()
  const { requests, reload } = useEventRequests(eventId)
  const { queueRequest } = useQueueRequest(eventId, reload)

  const declineRequest = useCallback(
    async (request: SongRequest) => {
      await service.updateRequestStatus(request.id, 'declined')
      await reload()
    },
    [service, reload],
  )

  const state = useAutoAccept(eventId, requests, queueRequest, declineRequest)

  return (
    <AutoAcceptContext.Provider value={state}>
      {children}
    </AutoAcceptContext.Provider>
  )
}

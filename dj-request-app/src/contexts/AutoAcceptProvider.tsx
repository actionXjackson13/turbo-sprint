import type { ReactNode } from 'react'
import { AutoAcceptContext } from './autoAcceptContext'
import { useEventRequests } from '../features/requests/useEventRequests'
import { useQueueRequest } from '../features/requests/useQueueRequest'
import { useAutoAccept } from '../features/requests/useAutoAccept'

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
  const { requests, reload } = useEventRequests(eventId)
  const { queueRequest } = useQueueRequest(eventId, reload)
  const state = useAutoAccept(eventId, requests, queueRequest)

  return (
    <AutoAcceptContext.Provider value={state}>
      {children}
    </AutoAcceptContext.Provider>
  )
}

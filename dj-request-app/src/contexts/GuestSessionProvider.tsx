import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useService } from '../hooks/useService'
import type { EventGuest, EventRecord } from '../types/domain'
import { getErrorMessage } from '../utils/errors'
import {
  clearLastEventId,
  setLastEventId,
  setRememberedDisplayName,
} from '../utils/guestId'
import { GuestSessionContext, type GuestSessionValue } from './guestSessionContext'

export interface GuestSessionProviderProps {
  /** The event whose session should be loaded, from the route. */
  eventId: string | null
  children: ReactNode
}

/**
 * Resolves and keeps the guest's event membership.
 *
 * The guest identity itself is persistent (localStorage in demo mode, an
 * anonymous Supabase session against a real project), so re-reading membership
 * on mount is what makes a page refresh land the guest back in the event
 * rather than at the join screen.
 */
export function GuestSessionProvider({
  eventId,
  children,
}: GuestSessionProviderProps) {
  const service = useService()
  const [event, setEvent] = useState<EventRecord | null>(null)
  const [guest, setGuest] = useState<EventGuest | null>(null)
  const [loading, setLoading] = useState(eventId !== null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!eventId) {
      setEvent(null)
      setGuest(null)
      setLoading(false)
      return
    }

    try {
      // Identity first: without it there is no membership to look up.
      await service.getOrCreateGuestIdentity()
      const [nextEvent, nextGuest] = await Promise.all([
        service.getEventById(eventId),
        service.getGuestSession(eventId),
      ])
      setEvent(nextEvent)
      setGuest(nextGuest)
      setError(nextEvent ? null : 'That event could not be found.')

      // Record the resume pointer here rather than in each entry path, so
      // arriving by any route (join flow, demo shortcut, shared link) lets the
      // welcome screen offer "back to your event".
      if (nextEvent && nextEvent.status === 'active' && nextGuest) {
        setLastEventId(nextEvent.id)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [service, eventId])

  useEffect(() => {
    setLoading(eventId !== null)
    void refresh()
  }, [refresh, eventId])

  // Keep the event card live: intake status and now-playing change often.
  useEffect(() => {
    if (!eventId) return
    return service.subscribeEvent(eventId, () => {
      void refresh()
    })
  }, [service, eventId, refresh])

  const join = useCallback(
    async (code: string, displayName: string) => {
      const result = await service.joinEvent(code, displayName)
      setEvent(result.event)
      setGuest(result.guest)
      setError(null)
      setLastEventId(result.event.id)
      setRememberedDisplayName(displayName)
      return result.event
    },
    [service],
  )

  const leave = useCallback(() => {
    clearLastEventId()
    setEvent(null)
    setGuest(null)
  }, [])

  const value = useMemo<GuestSessionValue>(
    () => ({ event, guest, loading, error, refresh, join, leave }),
    [event, guest, loading, error, refresh, join, leave],
  )

  return (
    <GuestSessionContext.Provider value={value}>
      {children}
    </GuestSessionContext.Provider>
  )
}

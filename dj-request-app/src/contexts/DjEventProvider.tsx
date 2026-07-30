import { useCallback, useMemo, type ReactNode } from 'react'
import { useService } from '../hooks/useService'
import { useLiveData } from '../hooks/useAsyncData'
import { DjEventContext, type DjEventValue } from './djEventContext'

/**
 * Loads the event a DJ screen is scoped to, keeping it live so intake status,
 * now-playing and guest count stay current across every DJ tab.
 */
export function DjEventProvider({
  eventId,
  children,
}: {
  eventId: string
  children: ReactNode
}) {
  const service = useService()

  const loader = useCallback(async () => {
    const [event, guestCount] = await Promise.all([
      service.getEventById(eventId),
      service.getEventGuestCount(eventId),
    ])
    return { event, guestCount }
  }, [service, eventId])

  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeEvent(eventId, onChange),
    [service, eventId],
  )

  const { data, loading, error, reload } = useLiveData(loader, subscribe)

  const value = useMemo<DjEventValue>(
    () => ({
      event: data?.event ?? null,
      guestCount: data?.guestCount ?? 0,
      loading,
      error,
      refresh: reload,
    }),
    [data, loading, error, reload],
  )

  return (
    <DjEventContext.Provider value={value}>{children}</DjEventContext.Provider>
  )
}

import { useCallback, useMemo, type ReactNode } from 'react'
import { useService } from '../hooks/useService'
import { useLiveData } from '../hooks/useAsyncData'
import { useHostParty } from '../hooks/useHostParty'
import { DjEventContext, type DjEventValue } from './djEventContext'

/**
 * Loads the event a DJ screen is scoped to, keeping it live so intake status,
 * now-playing and guest count stay current across every DJ tab.
 *
 * Also where the party goes online. Hosting belongs to the event rather than
 * to any one screen — the DJ moves between the control panel, the queue and
 * the invite screen all night, and guests must not be dropped in between — and
 * every DJ screen is already inside this provider.
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

  /**
   * Both, because this loads both: the event row and how many people are at it.
   * Watching only the event meant the guest count sat still all night while
   * people arrived.
   */
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offEvent = service.subscribeEvent(eventId, onChange)
      const offGuests = service.subscribeGuests(eventId, onChange)
      return () => {
        offEvent()
        offGuests()
      }
    },
    [service, eventId],
  )

  const { data, loading, error, reload } = useLiveData(loader, subscribe)

  useHostParty(eventId, data?.event?.code)

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

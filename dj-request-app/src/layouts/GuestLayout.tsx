import { Navigate, Outlet, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { RootLayout } from './RootLayout'
import {
  BottomNavigation,
  LoadingSkeleton,
  NavIcons,
  type NavItem,
} from '../components'
import { routes } from '../lib/router'
import { GuestSessionProvider } from '../contexts/GuestSessionProvider'
import { useGuestSession } from '../hooks/useGuestSession'

/**
 * Shell for every in-event guest screen: session provider, scrollable content,
 * and the fixed bottom navigation.
 */
export function GuestLayout() {
  const { eventId } = useParams<{ eventId: string }>()

  if (!eventId) return <Navigate to={routes.guest.join} replace />

  const items: NavItem[] = [
    {
      to: routes.guest.home(eventId),
      label: 'Event',
      icon: NavIcons.home,
      end: true,
    },
    { to: routes.guest.request(eventId), label: 'Request', icon: NavIcons.add },
    { to: routes.guest.voting(eventId), label: 'Vote', icon: NavIcons.vote },
    { to: routes.guest.myRequests(eventId), label: 'Mine', icon: NavIcons.list },
  ]

  return (
    <GuestSessionProvider eventId={eventId}>
      <RootLayout hasBottomNav>
        <GuestGate>
          <Outlet />
        </GuestGate>
        <BottomNavigation items={items} />
      </RootLayout>
    </GuestSessionProvider>
  )
}

/**
 * Keeps un-joined visitors out of event screens. This is a navigation
 * convenience only — the real protection is server-side, where a guest without
 * a membership row cannot read or write the event's data.
 */
function GuestGate({ children }: { children: ReactNode }) {
  const { event, guest, loading } = useGuestSession()

  if (loading) {
    return (
      <div className="flex-1 space-y-3 p-4 pt-safe">
        <LoadingSkeleton className="h-8 w-1/2" />
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-24" />
      </div>
    )
  }

  // Unknown event, or this device never joined it.
  if (!event || !guest) {
    return <Navigate to={routes.guest.join} replace />
  }

  return <>{children}</>
}

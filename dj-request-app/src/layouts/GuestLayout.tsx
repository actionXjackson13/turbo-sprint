import { Navigate, Outlet, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { RootLayout } from './RootLayout'
import {
  BottomNavigation,
  DemoSwitcher,
  LoadingSkeleton,
  NavIcons,
  type NavItem,
} from '../components'
import { routes } from '../lib/router'
import { isDemoMode } from '../lib/env'
import { GuestSessionProvider } from '../contexts/GuestSessionProvider'
import { useGuestSession } from '../hooks/useGuestSession'
import { useVotingRound } from '../features/voting-rounds/useVotingRound'

/**
 * Shell for every in-event guest screen: session provider, scrollable content,
 * and the fixed bottom navigation.
 */
export function GuestLayout() {
  const { eventId } = useParams<{ eventId: string }>()

  if (!eventId) return <Navigate to={routes.guest.join} replace />

  return (
    <GuestSessionProvider eventId={eventId}>
      <RootLayout hasBottomNav>
        <GuestGate>
          <Outlet />
        </GuestGate>
        <GuestNav eventId={eventId} />
        {isDemoMode() && <DemoSwitcher eventId={eventId} view="guest" />}
      </RootLayout>
    </GuestSessionProvider>
  )
}

/**
 * Four destinations, no actions.
 *
 * "Request a song" used to sit here, which put a verb among a list of places
 * and left nowhere to browse what everyone else had asked for. Composing a
 * request is now a button on the screens where you would want one.
 */
function GuestNav({ eventId }: { eventId: string }) {
  const { results } = useVotingRound(eventId)
  const voteOpen = results?.round.status === 'active'

  const items: NavItem[] = [
    {
      to: routes.guest.home(eventId),
      label: 'Home',
      icon: NavIcons.home,
      end: true,
    },
    {
      to: routes.guest.requests(eventId),
      label: 'Requests',
      icon: NavIcons.list,
    },
    {
      to: routes.guest.voting(eventId),
      label: 'Vote',
      icon: NavIcons.vote,
      disabled: !voteOpen,
      disabledReason: 'No vote running yet',
    },
    {
      to: routes.guest.myRequests(eventId),
      label: 'My Songs',
      icon: NavIcons.note,
    },
  ]

  return <BottomNavigation items={items} />
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

import { Outlet, useParams } from 'react-router-dom'
import { RootLayout } from './RootLayout'
import { BottomNavigation, NavIcons, type NavItem } from '../components'
import { routes } from '../lib/router'

/**
 * Shell for every in-event guest screen: scrollable content plus the fixed
 * four-item bottom navigation.
 */
export function GuestLayout() {
  const { eventId } = useParams<{ eventId: string }>()

  // The router guarantees :eventId here; fall back defensively rather than
  // rendering links to `/e/undefined`.
  if (!eventId) return null

  const items: NavItem[] = [
    {
      to: routes.guest.home(eventId),
      label: 'Event',
      icon: NavIcons.home,
      end: true,
    },
    {
      to: routes.guest.request(eventId),
      label: 'Request',
      icon: NavIcons.add,
    },
    {
      to: routes.guest.voting(eventId),
      label: 'Vote',
      icon: NavIcons.vote,
    },
    {
      to: routes.guest.myRequests(eventId),
      label: 'Mine',
      icon: NavIcons.list,
    },
  ]

  return (
    <RootLayout hasBottomNav>
      <Outlet />
      <BottomNavigation items={items} />
    </RootLayout>
  )
}

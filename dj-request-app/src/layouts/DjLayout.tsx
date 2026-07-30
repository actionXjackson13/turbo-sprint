import { Outlet, useParams } from 'react-router-dom'
import { RootLayout } from './RootLayout'
import { BottomNavigation, NavIcons, type NavItem } from '../components'
import { routes } from '../lib/router'

/**
 * Shell for the DJ's per-event screens. The dashboard and create-event screens
 * sit outside this layout because they are not scoped to a single event.
 */
export function DjLayout() {
  const { eventId } = useParams<{ eventId: string }>()

  if (!eventId) return null

  const items: NavItem[] = [
    {
      to: routes.dj.event(eventId),
      label: 'Control',
      icon: NavIcons.dashboard,
      end: true,
    },
    {
      to: routes.dj.requests(eventId),
      label: 'Requests',
      icon: NavIcons.list,
    },
    {
      to: routes.dj.queue(eventId),
      label: 'Queue',
      icon: NavIcons.queue,
    },
    {
      to: routes.dj.activeVote(eventId),
      label: 'Vote',
      icon: NavIcons.vote,
    },
    {
      to: routes.dj.settings(eventId),
      label: 'Settings',
      icon: NavIcons.settings,
    },
  ]

  return (
    <RootLayout hasBottomNav>
      <Outlet />
      <BottomNavigation items={items} />
    </RootLayout>
  )
}

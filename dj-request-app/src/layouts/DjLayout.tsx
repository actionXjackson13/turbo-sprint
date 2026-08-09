import { Navigate, Outlet, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { RootLayout } from './RootLayout'
import {
  BottomNavigation,
  DemoSwitcher,
  EmptyState,
  LoadingSkeleton,
  NavIcons,
  type NavItem,
} from '../components'
import { routes } from '../lib/router'
import { useParty } from '../hooks/useParty'
import { DjEventProvider } from '../contexts/DjEventProvider'
import { PartyPlayerProvider } from '../contexts/PartyPlayerProvider'
import { PlayerBarSpacer } from '../features/player/PlayerBar'
import { useDjEvent } from '../hooks/useDjEvent'
import { useDjAuth } from '../hooks/useDjAuth'
import { useWakeLock } from '../hooks/useWakeLock'
import { useVotingRound } from '../features/voting-rounds/useVotingRound'

/**
 * Shell for the DJ's per-event screens. The dashboard and create-event screens
 * sit outside this layout because they are not scoped to a single event.
 */
export function DjLayout() {
  const { eventId } = useParams<{ eventId: string }>()
  const { profile, loading } = useDjAuth()
  // Acting as a guest edits this device's store directly, behind the back of
  // anyone connected to it. Sandbox only.
  const sandbox = useParty().mode === 'sandbox'

  // The DJ's screens double as a glanceable display mid-set; locking every
  // thirty seconds and having to unlock one-handed is the wrong interaction
  // while mixing. Guest screens deliberately do not do this — it is the DJ's
  // battery to spend, not a guest's.
  useWakeLock(Boolean(profile))

  if (loading) {
    return (
      <RootLayout>
        <div className="flex-1 space-y-3 p-4 pt-safe">
          <LoadingSkeleton className="h-8 w-1/2" />
          <LoadingSkeleton className="h-32" />
        </div>
      </RootLayout>
    )
  }

  if (!profile) return <Navigate to={routes.dj.signIn} replace />
  if (!eventId) return <Navigate to={routes.dj.dashboard} replace />

  return (
    <DjEventProvider eventId={eventId}>
      {/* Above the outlet, so the music survives the DJ changing screens. */}
      <PartyPlayerProvider eventId={eventId}>
        <RootLayout hasBottomNav>
          <DjEventGate>
            <Outlet />
            {/* Gives back the strip the fixed transport is sitting on. */}
            <PlayerBarSpacer />
          </DjEventGate>
          <DjNav eventId={eventId} />
          {sandbox && <DemoSwitcher eventId={eventId} view="dj" />}
        </RootLayout>
      </PartyPlayerProvider>
    </DjEventProvider>
  )
}

/**
 * Vote is a destination again rather than a block on the control panel, so it
 * gets a slot here. The badge carries the one thing the DJ lost by moving it
 * off Control: that a round is running, and how many have voted.
 */
function DjNav({ eventId }: { eventId: string }) {
  const { results } = useVotingRound(eventId)
  const liveVote =
    results && results.round.status === 'active' ? results : null

  const items: NavItem[] = [
    {
      to: routes.dj.event(eventId),
      label: 'Control',
      icon: NavIcons.dashboard,
      end: true,
    },
    { to: routes.dj.requests(eventId), label: 'Requests', icon: NavIcons.list },
    { to: routes.dj.queue(eventId), label: 'Queue', icon: NavIcons.queue },
    {
      // One tab for everything that is not the queue. The badge stays on it,
      // since a running vote is still the thing most worth interrupting for.
      to: routes.dj.features(eventId),
      label: 'Features',
      icon: NavIcons.vote,
      badge: liveVote?.totalVotes,
      badgeLabel: 'votes cast',
    },
    {
      to: routes.dj.settings(eventId),
      label: 'Settings',
      icon: NavIcons.settings,
    },
  ]

  return <BottomNavigation items={items} />
}

/**
 * Shows a clear message when the event is missing or not this DJ's. Ownership
 * is enforced server-side; this only avoids rendering an empty control panel.
 */
function DjEventGate({ children }: { children: ReactNode }) {
  const { event, loading } = useDjEvent()

  if (loading && !event) {
    return (
      <div className="flex-1 space-y-3 p-4 pt-safe">
        <LoadingSkeleton className="h-8 w-1/2" />
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-24" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          title="Event unavailable"
          description="It may have been removed, or it belongs to another DJ."
        />
      </div>
    )
  }

  return <>{children}</>
}

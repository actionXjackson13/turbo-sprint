import { Navigate, Outlet, useParams } from 'react-router-dom'
import { EmptyState, LoadingSkeleton } from '../components'
import { routes } from '../lib/router'
import { DjEventProvider } from '../contexts/DjEventProvider'
import { useDjEvent } from '../hooks/useDjEvent'
import { useDjAuth } from '../hooks/useDjAuth'
import { useEventTheme } from '../features/theme/useEventTheme'

/**
 * The shell for the floating panel, which is a DJ screen with the app removed
 * from around it.
 *
 * `DjLayout` cannot be reused: it brings the bottom navigation, the safe-area
 * padding of a phone and the player transport, none of which belong in a
 * 380-pixel window pinned over rekordbox — and, more importantly, it mounts the
 * player. Two windows both mounting the player would be two players, each
 * loading the YouTube API, each claiming the media session, each racing the
 * other to advance the queue. So the panel deliberately gets the event and the
 * theme and nothing else.
 *
 * It is a route rather than a component the desktop app draws itself, which is
 * what makes it testable in a browser and what lets the desktop app stay a thin
 * shell around the live site.
 */
export function DjPanelLayout() {
  const { eventId } = useParams<{ eventId: string }>()
  const { profile, loading } = useDjAuth()

  if (loading) {
    return (
      <div className="flex h-dvh flex-col gap-3 bg-ink-950 p-3">
        <LoadingSkeleton className="h-6 w-1/2" />
        <LoadingSkeleton className="h-20" />
        <LoadingSkeleton className="h-16" />
      </div>
    )
  }

  if (!profile) return <Navigate to={routes.dj.signIn} replace />
  if (!eventId) return <Navigate to={routes.dj.dashboard} replace />

  return (
    <DjEventProvider eventId={eventId}>
      <PanelThemeStage eventId={eventId} />
      <div className="flex h-dvh flex-col overflow-hidden bg-ink-950 text-fg">
        <PanelGate>
          <Outlet />
        </PanelGate>
      </div>
    </DjEventProvider>
  )
}

function PanelGate({ children }: { children: React.ReactNode }) {
  const { event, loading } = useDjEvent()

  if (loading && !event) {
    return (
      <div className="flex-1 space-y-3 p-3">
        <LoadingSkeleton className="h-6 w-2/3" />
        <LoadingSkeleton className="h-20" />
        <LoadingSkeleton className="h-16" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <EmptyState
          title="Event unavailable"
          description="It may have ended, or it belongs to another DJ."
        />
      </div>
    )
  }

  return <>{children}</>
}

/** The panel wears the party's colours, same as every other screen. */
function PanelThemeStage({ eventId }: { eventId: string }) {
  const { event } = useDjEvent()
  useEventTheme(eventId, event?.theme)
  return null
}

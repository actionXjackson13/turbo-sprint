import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  StatusBadge,
} from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useDjAuth } from '../../hooks/useDjAuth'
import { formatRelativeTime } from '../../utils/formatRelativeTime'

export function DjDashboardPage() {
  const navigate = useNavigate()
  const service = useService()
  const { profile, signOut } = useDjAuth()

  const loader = useCallback(() => service.getDjEvents(), [service])
  const { data, loading, error } = useAsyncData(loader)
  const events = data ?? []

  const live = events.filter((e) => e.status === 'active')
  const past = events.filter((e) => e.status === 'ended')

  return (
    <RootLayout>
      <PageHeader
        title="Your events"
        subtitle={profile ? `Signed in as ${profile.displayName}` : undefined}
        action={
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => {
              void signOut().then(() => navigate(routes.welcome))
            }}
          >
            Sign out
          </AppButton>
        }
      />

      <main className="flex-1 space-y-5 px-4 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <AppButton
          size="lg"
          fullWidth
          onClick={() => navigate(routes.dj.createEvent)}
        >
          Create an event
        </AppButton>

        {error && (
          <p role="alert" className="text-sm text-danger-500">
            {error}
          </p>
        )}

        {loading && events.length === 0 ? (
          <div className="space-y-3">
            <LoadingSkeleton className="h-24" />
            <LoadingSkeleton className="h-24" />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            title="No events yet"
            description="Create one and share its code with your crowd."
          />
        ) : (
          <>
            {live.length > 0 && (
              <section aria-labelledby="live-heading">
                <h2
                  id="live-heading"
                  className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
                >
                  Live
                </h2>
                <div className="space-y-3">
                  {live.map((event) => (
                    <AppCard key={event.id} padded={false}>
                      <button
                        type="button"
                        onClick={() => navigate(routes.dj.event(event.id))}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-bold text-fg">
                              {event.name}
                            </h3>
                            <p className="mt-0.5 text-sm text-fg-muted">
                              Code{' '}
                              <span className="font-mono font-bold tracking-widest text-brand-400">
                                {event.code}
                              </span>
                            </p>
                          </div>
                          <StatusBadge
                            kind="intake"
                            status={event.requestStatus}
                          />
                        </div>
                        <p className="mt-2 text-xs text-fg-subtle">
                          Started {formatRelativeTime(event.createdAt)}
                        </p>
                      </button>
                    </AppCard>
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section aria-labelledby="past-heading">
                <h2
                  id="past-heading"
                  className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
                >
                  Ended
                </h2>
                <div className="space-y-3">
                  {past.map((event) => (
                    <AppCard key={event.id} padded={false}>
                      <button
                        type="button"
                        onClick={() => navigate(routes.dj.event(event.id))}
                        className="w-full p-4 text-left"
                      >
                        <h3 className="truncate text-base font-semibold text-fg-muted">
                          {event.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          Ended{' '}
                          {event.endedAt
                            ? formatRelativeTime(event.endedAt)
                            : ''}
                        </p>
                      </button>
                    </AppCard>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </RootLayout>
  )
}

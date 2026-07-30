import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  EmptyState,
  PageHeader,
  SongRequestListSkeleton,
  SongRequestCard,
  StatusBadge,
} from '../../components'
import { routes } from '../../lib/router'
import { useGuestSession } from '../../hooks/useGuestSession'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { useVotingRound } from '../../features/voting-rounds/useVotingRound'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { formatCountdown } from '../../utils/formatRelativeTime'

export function EventHomePage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const online = useOnlineStatus()

  const { event, guest } = useGuestSession()
  const { requests, myVotes, loading, pendingVotes, toggleVote } =
    useEventRequests(eventId)
  const { results, secondsRemaining } = useVotingRound(eventId)

  // "Popular" excludes finished business so the list stays actionable.
  const popular = useMemo(
    () =>
      [...requests]
        .filter((r) => ['pending', 'accepted', 'queued'].includes(r.status))
        .sort((a, b) => b.voteCount - a.voteCount)
        .slice(0, 5),
    [requests],
  )

  const recent = useMemo(
    () => requests.filter((r) => r.status !== 'declined').slice(0, 5),
    [requests],
  )

  const activeRound =
    results && results.round.status === 'active' ? results : null

  return (
    <>
      <PageHeader
        title={event?.name ?? 'Event'}
        subtitle={event ? `with ${event.djDisplayName}` : undefined}
      />

      <main className="flex-1 space-y-5 px-4 py-4">
        {!online && (
          <div
            role="status"
            className="rounded-2xl border border-status-pending/40 bg-status-pending/10 p-3 text-sm text-status-pending"
          >
            You're offline. Updates will resume when you reconnect.
          </div>
        )}

        {event && (
          <div className="flex items-center justify-between gap-3">
            <StatusBadge kind="intake" status={event.requestStatus} />
            {guest?.isBlocked && (
              <span className="text-xs font-semibold text-danger-500">
                Requests disabled by the DJ
              </span>
            )}
          </div>
        )}

        {/* Now playing */}
        <section aria-labelledby="now-playing-heading">
          <h2
            id="now-playing-heading"
            className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
          >
            Now playing
          </h2>
          {event?.nowPlaying ? (
            <AppCard emphasis>
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="size-5"
                    aria-hidden="true"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-fg">
                    {event.nowPlaying.title}
                  </p>
                  <p className="truncate text-sm text-fg-muted">
                    {event.nowPlaying.artist}
                  </p>
                </div>
              </div>
            </AppCard>
          ) : (
            <AppCard>
              <p className="text-sm text-fg-muted">
                The DJ hasn't set a track yet.
              </p>
            </AppCard>
          )}
        </section>

        {/* Active vote */}
        {activeRound && (
          <section aria-labelledby="vote-heading">
            <div className="mb-2 flex items-baseline justify-between">
              <h2
                id="vote-heading"
                className="text-xs font-semibold tracking-wide text-fg-subtle uppercase"
              >
                Vote for the next song
              </h2>
              {secondsRemaining !== null && (
                <span className="text-xs font-bold tabular-nums text-brand-400">
                  {formatCountdown(secondsRemaining)}
                </span>
              )}
            </div>
            <AppCard emphasis>
              <p className="text-sm text-fg-muted">
                {activeRound.totalVotes}{' '}
                {activeRound.totalVotes === 1 ? 'vote' : 'votes'}
                {activeRound.myOptionId
                  ? ' · you voted'
                  : ' · you haven’t voted yet'}
              </p>
              <AppButton
                fullWidth
                className="mt-3"
                onClick={() => navigate(routes.guest.voting(eventId))}
              >
                {activeRound.myOptionId ? 'Change your vote' : 'Vote now'}
              </AppButton>
            </AppCard>
          </section>
        )}

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-3">
          <AppButton
            size="lg"
            onClick={() => navigate(routes.guest.request(eventId))}
            disabled={event?.requestStatus !== 'open' || guest?.isBlocked}
          >
            Request a song
          </AppButton>
          <AppButton
            variant="secondary"
            size="lg"
            onClick={() => navigate(routes.guest.myRequests(eventId))}
          >
            My requests
          </AppButton>
        </div>

        {/* Popular */}
        <section aria-labelledby="popular-heading">
          <h2
            id="popular-heading"
            className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
          >
            Most wanted
          </h2>
          {loading ? (
            <SongRequestListSkeleton count={2} />
          ) : popular.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="Be the first to ask for a song."
            />
          ) : (
            <div className="space-y-3">
              {popular.map((request) => (
                <SongRequestCard
                  key={request.id}
                  request={request}
                  showVote
                  hasVoted={myVotes.has(request.id)}
                  voteLocked={
                    guest !== null &&
                    request.guestId === guest.id &&
                    myVotes.has(request.id)
                  }
                  votePending={pendingVotes.has(request.id)}
                  onVoteToggle={() =>
                    toggleVote(request, request.guestId === guest?.id)
                  }
                  onOpen={() =>
                    navigate(routes.guest.requestDetails(eventId, request.id))
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent */}
        {recent.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2
              id="recent-heading"
              className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
            >
              Just requested
            </h2>
            <div className="space-y-3">
              {recent.map((request) => (
                <SongRequestCard
                  key={request.id}
                  request={request}
                  showVote
                  hasVoted={myVotes.has(request.id)}
                  voteLocked={
                    guest !== null &&
                    request.guestId === guest.id &&
                    myVotes.has(request.id)
                  }
                  votePending={pendingVotes.has(request.id)}
                  onVoteToggle={() =>
                    toggleVote(request, request.guestId === guest?.id)
                  }
                  onOpen={() =>
                    navigate(routes.guest.requestDetails(eventId, request.id))
                  }
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}

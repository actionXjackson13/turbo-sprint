import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  NowPlayingCard,
  PageHeader,
  Section,
  SectionLink,
  SongRequestListSkeleton,
  SongRequestCard,
  StatusBadge,
} from '../../components'
import { routes } from '../../lib/router'
import { useGuestSession } from '../../hooks/useGuestSession'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { selectMostWanted } from '../../features/requests/requestLists'
import { useVotingRound } from '../../features/voting-rounds/useVotingRound'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { formatCountdown } from '../../utils/formatRelativeTime'

/** A taste of what the room wants — the full list is one tap away. */
const HOME_PREVIEW = 3

export function EventHomePage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const online = useOnlineStatus()

  const { event, guest } = useGuestSession()
  const { requests, myVotes, loading, pendingVotes, toggleVote } =
    useEventRequests(eventId)
  const { results, secondsRemaining } = useVotingRound(eventId)

  // A taste of what the room wants. Browsing and ordering live on the
  // Requests tab: a home screen should answer "what now?", not "show me
  // everything sorted how I like".
  const popular = useMemo(
    () => selectMostWanted(requests, HOME_PREVIEW),
    [requests],
  )

  const activeRound =
    results && results.round.status === 'active' ? results : null
  const canRequest = event?.requestStatus === 'open' && !guest?.isBlocked

  return (
    <>
      {/* Intake state rides in the subtitle rather than the trailing action,
          so a long event name still gets the full width of the title row. */}
      <PageHeader
        title={event?.name ?? 'Event'}
        subtitle={
          event && (
            <span className="flex items-center gap-2">
              <span className="truncate">with {event.djDisplayName}</span>
              <StatusBadge kind="intake" status={event.requestStatus} />
            </span>
          )
        }
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        {!online && (
          <div
            role="status"
            className="rounded-control border border-status-pending/40 bg-status-pending/10 p-3 text-sm text-status-pending"
          >
            You're offline. Updates will resume when you reconnect.
          </div>
        )}

        <Section title="Now playing">
          <NowPlayingCard
            nowPlaying={event?.nowPlaying ?? null}
            emptyHint="The DJ hasn't set a track yet."
          />
        </Section>

        {activeRound && (
          <Section
            title="Vote for the next song"
            action={
              secondsRemaining !== null && (
                <span className="text-xs font-bold tabular-nums text-brand-400">
                  {formatCountdown(secondsRemaining)}
                </span>
              )
            }
          >
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
          </Section>
        )}

        {/* "My requests" lives in the bottom navigation, so the one action
            worth a button here is the one that starts something. */}
        <div>
          <AppButton
            size="lg"
            fullWidth
            onClick={() => navigate(routes.guest.request(eventId))}
            disabled={!canRequest}
          >
            Request a song
          </AppButton>
          {!canRequest && (
            <p className="mt-2 text-center text-sm text-fg-muted">
              {guest?.isBlocked
                ? 'The DJ has turned off your requests.'
                : event?.requestStatus === 'paused'
                  ? 'The DJ has paused requests right now.'
                  : 'Requests are closed for this event.'}
            </p>
          )}
        </div>

        {/* Hidden entirely when there is nothing to show, rather than an
            empty card saying so. */}
        {loading && requests.length === 0 ? (
          <Section title="Popular">
            <SongRequestListSkeleton count={2} />
          </Section>
        ) : popular.length > 0 ? (
          <Section
            title="Popular"
            action={
              <SectionLink
                onClick={() => navigate(routes.guest.requests(eventId))}
              >
                View all
              </SectionLink>
            }
          >
            <div className="space-y-2">
              {popular.map((request) => (
                <SongRequestCard
                  key={request.id}
                  request={request}
                  showVote
                  showStatus={false}
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
          </Section>
        ) : null}
      </main>
    </>
  )
}

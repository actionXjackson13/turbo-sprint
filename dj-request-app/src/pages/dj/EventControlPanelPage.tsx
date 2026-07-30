import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  EmptyState,
  PageHeader,
  SongRequestCard,
  SongRequestListSkeleton,
  StatusBadge,
} from '../../components'
import { routes } from '../../lib/router'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { useVotingRound } from '../../features/voting-rounds/useVotingRound'
import { copyToClipboard } from '../../utils/clipboard'
import { getErrorMessage } from '../../utils/errors'
import { formatCountdown } from '../../utils/formatRelativeTime'
import type { RequestIntakeStatus } from '../../types/domain'

export function EventControlPanelPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const { event, guestCount, refresh } = useDjEvent()
  const { requests, loading, reload } = useEventRequests(eventId, {
    sort: 'votes',
  })
  const { results, secondsRemaining } = useVotingRound(eventId)

  const [busy, setBusy] = useState(false)

  const pending = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests],
  )
  const accepted = useMemo(
    () => requests.filter((r) => r.status === 'accepted'),
    [requests],
  )
  const queue = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'queued')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [requests],
  )

  const activeRound =
    results && results.round.status === 'active' ? results : null

  const copyCode = async () => {
    if (!event) return
    const ok = await copyToClipboard(event.code)
    if (ok) toast.success(`Code ${event.code} copied`)
    else toast.error('Could not copy — long-press the code to copy it.')
  }

  const setIntake = async (next: RequestIntakeStatus) => {
    setBusy(true)
    try {
      await service.updateEventSettings(eventId, { requestStatus: next })
      await refresh()
      toast.success(
        next === 'open'
          ? 'Requests are open.'
          : next === 'paused'
            ? 'Requests paused.'
            : 'Requests closed.',
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const quickAction = async (
    requestId: string,
    status: 'accepted' | 'queued' | 'declined',
  ) => {
    try {
      await service.updateRequestStatus(requestId, status)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  if (!event) return null

  return (
    <>
      <PageHeader
        title={event.name}
        subtitle={`${guestCount} ${guestCount === 1 ? 'guest' : 'guests'} joined`}
      />

      <main className="flex-1 space-y-5 px-4 py-4">
        {/* Event code */}
        <AppCard emphasis>
          <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
            Event code
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-4xl font-bold tracking-[0.25em] text-brand-400">
              {event.code}
            </span>
            <AppButton variant="secondary" onClick={copyCode}>
              Copy
            </AppButton>
          </div>
        </AppCard>

        {/* Intake control */}
        <section aria-labelledby="intake-heading">
          <div className="mb-2 flex items-center justify-between">
            <h2
              id="intake-heading"
              className="text-xs font-semibold tracking-wide text-fg-subtle uppercase"
            >
              Requests
            </h2>
            <StatusBadge kind="intake" status={event.requestStatus} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AppButton
              variant={event.requestStatus === 'open' ? 'success' : 'secondary'}
              disabled={busy || event.requestStatus === 'open'}
              onClick={() => setIntake('open')}
            >
              Open
            </AppButton>
            <AppButton
              variant={
                event.requestStatus === 'paused' ? 'primary' : 'secondary'
              }
              disabled={busy || event.requestStatus === 'paused'}
              onClick={() => setIntake('paused')}
            >
              Pause
            </AppButton>
            <AppButton
              variant={
                event.requestStatus === 'closed' ? 'danger' : 'secondary'
              }
              disabled={busy || event.requestStatus === 'closed'}
              onClick={() => setIntake('closed')}
            >
              Close
            </AppButton>
          </div>
        </section>

        {/* Now playing */}
        <section aria-labelledby="np-heading">
          <h2
            id="np-heading"
            className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
          >
            Now playing
          </h2>
          <AppCard>
            {event.nowPlaying ? (
              <>
                <p className="truncate text-base font-bold text-fg">
                  {event.nowPlaying.title}
                </p>
                <p className="truncate text-sm text-fg-muted">
                  {event.nowPlaying.artist}
                </p>
              </>
            ) : (
              <p className="text-sm text-fg-muted">Nothing set yet.</p>
            )}
            <AppButton
              variant="secondary"
              fullWidth
              className="mt-3"
              onClick={() => navigate(routes.dj.queue(eventId))}
            >
              {event.nowPlaying ? 'Change' : 'Set now playing'}
            </AppButton>
          </AppCard>
        </section>

        {/* Voting */}
        <section aria-labelledby="vote-heading">
          <div className="mb-2 flex items-baseline justify-between">
            <h2
              id="vote-heading"
              className="text-xs font-semibold tracking-wide text-fg-subtle uppercase"
            >
              Next-song vote
            </h2>
            {activeRound && secondsRemaining !== null && (
              <span className="text-xs font-bold tabular-nums text-brand-400">
                {formatCountdown(secondsRemaining)}
              </span>
            )}
          </div>
          <AppCard emphasis={Boolean(activeRound)}>
            {activeRound ? (
              <>
                <p className="text-sm text-fg-muted">
                  Running · {activeRound.totalVotes}{' '}
                  {activeRound.totalVotes === 1 ? 'vote' : 'votes'}
                </p>
                <AppButton
                  fullWidth
                  className="mt-3"
                  onClick={() => navigate(routes.dj.activeVote(eventId))}
                >
                  Manage vote
                </AppButton>
              </>
            ) : (
              <>
                <p className="text-sm text-fg-muted">
                  Let the crowd pick what plays next.
                </p>
                <AppButton
                  fullWidth
                  className="mt-3"
                  onClick={() => navigate(routes.dj.createVote(eventId))}
                >
                  Create a vote
                </AppButton>
              </>
            )}
          </AppCard>
        </section>

        {/* New requests */}
        <section aria-labelledby="new-heading">
          <div className="mb-2 flex items-center justify-between">
            <h2
              id="new-heading"
              className="text-xs font-semibold tracking-wide text-fg-subtle uppercase"
            >
              New requests
            </h2>
            {pending.length > 0 && (
              <span className="text-xs font-bold text-brand-400">
                {pending.length}
              </span>
            )}
          </div>

          {loading && requests.length === 0 ? (
            <SongRequestListSkeleton count={2} />
          ) : pending.length === 0 ? (
            <EmptyState
              title="All caught up"
              description="New requests land here as guests send them."
            />
          ) : (
            <div className="space-y-3">
              {pending.slice(0, 4).map((request) => (
                <SongRequestCard
                  key={request.id}
                  request={request}
                  showStatus={false}
                  actions={
                    <>
                      <AppButton
                        size="sm"
                        variant="success"
                        onClick={() => quickAction(request.id, 'queued')}
                      >
                        Queue
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="secondary"
                        onClick={() => quickAction(request.id, 'accepted')}
                      >
                        Accept
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        onClick={() => quickAction(request.id, 'declined')}
                      >
                        Decline
                      </AppButton>
                    </>
                  }
                />
              ))}
              {pending.length > 4 && (
                <AppButton
                  variant="secondary"
                  fullWidth
                  onClick={() => navigate(routes.dj.requests(eventId))}
                >
                  See all {pending.length} new requests
                </AppButton>
              )}
            </div>
          )}
        </section>

        {/* Summary counts */}
        <div className="grid grid-cols-2 gap-3">
          <AppCard>
            <p className="text-2xl font-bold tabular-nums text-fg">
              {accepted.length}
            </p>
            <p className="text-sm text-fg-muted">Accepted</p>
          </AppCard>
          <AppCard>
            <p className="text-2xl font-bold tabular-nums text-fg">
              {queue.length}
            </p>
            <p className="text-sm text-fg-muted">In queue</p>
          </AppCard>
        </div>
      </main>
    </>
  )
}

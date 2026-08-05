import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlbumArt,
  AppButton,
  AppCard,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  StatusBadge,
} from '../../components'
import { useService } from '../../hooks/useService'
import { useLiveData } from '../../hooks/useAsyncData'
import { useToast } from '../../hooks/useToast'
import { useGuestSession } from '../../hooks/useGuestSession'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { getErrorMessage } from '../../utils/errors'
import type { RequestStatus } from '../../types/domain'

const statusExplanations: Record<RequestStatus, string> = {
  pending: 'The DJ hasn’t looked at this yet.',
  accepted: 'The DJ likes it — it should play at some point.',
  queued: 'It’s in the queue and coming up.',
  played: 'This one already played.',
  declined: 'The DJ passed on this one.',
}

export function RequestDetailsPage() {
  const { eventId = '', requestId = '' } = useParams<{
    eventId: string
    requestId: string
  }>()
  const service = useService()
  const toast = useToast()
  const { guest } = useGuestSession()
  const [voting, setVoting] = useState(false)

  const loader = useCallback(async () => {
    const [request, votes] = await Promise.all([
      service.getSongRequest(requestId),
      service.getMyRequestVotes(eventId),
    ])
    return { request, hasVoted: votes.includes(requestId) }
  }, [service, requestId, eventId])

  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeSongRequests(eventId, onChange),
    [service, eventId],
  )

  const { data, loading, reload } = useLiveData(loader, subscribe)
  const request = data?.request ?? null
  const hasVoted = data?.hasVoted ?? false

  const isOwn = request !== null && guest !== null && request.guestId === guest.id
  const voteLocked = isOwn && hasVoted

  const toggleVote = async () => {
    if (!request || voteLocked) return
    setVoting(true)
    try {
      if (hasVoted) await service.removeRequestVote(request.id)
      else await service.voteRequest(request.id)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setVoting(false)
    }
  }

  if (loading && !request) {
    return (
      <>
        <PageHeader title="Request" showBack />
        <main className="flex-1 space-y-3 px-4 py-4">
          <LoadingSkeleton className="h-24" />
          <LoadingSkeleton className="h-16" />
        </main>
      </>
    )
  }

  if (!request) {
    return (
      <>
        <PageHeader title="Request" showBack />
        <main className="flex-1">
          <EmptyState
            title="Request not found"
            description="It may have been removed by the DJ."
          />
        </main>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Request" showBack />

      <main className="flex-1 space-y-6 px-4 py-5">
        <AppCard emphasis>
          <div className="flex items-start gap-3">
            {/* The screen devoted to one song is the one place worth giving
                the cover real size. */}
            <AlbumArt url={request.artworkUrl} size="xl" />

            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl leading-tight font-bold text-fg">
                  {request.title}
                </h2>
                <p className="mt-1 text-base text-fg-muted">{request.artist}</p>
              </div>
              <StatusBadge status={request.status} />
            </div>
          </div>

          <p className="mt-3 text-sm text-fg-subtle">
            Asked by {request.guestDisplayName} ·{' '}
            {formatRelativeTime(request.createdAt)}
          </p>
        </AppCard>

        <AppCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-3xl font-bold tabular-nums text-fg">
                {request.voteCount}
              </p>
              <p className="text-sm text-fg-muted">
                {request.voteCount === 1 ? 'vote' : 'votes'}
              </p>
            </div>

            {voteLocked ? (
              <p className="max-w-[10rem] text-right text-sm text-fg-subtle">
                This is your request — your vote is locked in.
              </p>
            ) : (
              <AppButton
                variant={hasVoted ? 'secondary' : 'primary'}
                size="lg"
                loading={voting}
                onClick={toggleVote}
              >
                {hasVoted ? 'Remove vote' : 'Upvote'}
              </AppButton>
            )}
          </div>
        </AppCard>

        <AppCard>
          <p className="text-sm text-fg-muted">
            {statusExplanations[request.status]}
          </p>
        </AppCard>
      </main>
    </>
  )
}

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  ConfirmationDialog,
  EmptyState,
  LoadingSkeleton,
  VotingOptionCard,
} from '../../../components'
import { routes } from '../../../lib/router'
import { useService } from '../../../hooks/useService'
import { useToast } from '../../../hooks/useToast'
import { useVotingRound } from '../../../features/voting-rounds/useVotingRound'
import { queueOrderWithFirst } from '../../../features/requests/usePlayNext'
import { formatCountdown } from '../../../utils/formatRelativeTime'
import { getErrorMessage } from '../../../utils/errors'

/**
 * Running a vote, as a panel rather than a screen of its own.
 *
 * Identical behaviour to the tab it replaced — the header it used to draw is
 * now the Features screen's, and the countdown line carries what that header
 * was saying.
 */
export function VotePanel() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const { results, loading, reload, secondsRemaining } = useVotingRound(eventId)
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const round = results?.round ?? null
  const isActive = round?.status === 'active'

  const endEarly = async () => {
    if (!round) return
    setBusy(true)
    try {
      await service.endVotingRound(round.id)
      await reload()
      toast.success('Vote ended.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const cancelRound = async () => {
    if (!round) return
    setBusy(true)
    try {
      await service.cancelVotingRound(round.id)
      await reload()
      toast.success('Vote cancelled.')
      setConfirmCancel(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Send an option to the queue, optionally to the front of it.
   *
   * A finished vote is the moment the DJ decides what happens to the result,
   * and "the room picked this, play it next" is as common as "add it to the
   * pile" — so both are offered rather than making the second a trip to the
   * Queue tab.
   */
  const queueOption = async (optionId: string, toFront: boolean) => {
    if (!round) return
    setBusy(true)
    try {
      const queued = await service.pushWinnerToQueue(round.id, optionId)

      if (toFront) {
        const inQueue = await service.listSongRequests(eventId, {
          statuses: ['queued'],
        })
        await service.reorderQueue(
          eventId,
          queueOrderWithFirst(inQueue, queued.id),
        )
      }

      toast.success(
        toFront
          ? `${queued.title} plays next.`
          : `${queued.title} added to the queue.`,
      )
      navigate(routes.dj.queue(eventId))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !results) {
    return (
      <div className="space-y-3">
        <LoadingSkeleton className="h-20" />
        <LoadingSkeleton className="h-20" />
      </div>
    )
  }

  if (!results || !round) {
    return (
      <EmptyState
        title="No vote yet"
        description="Start one to let the crowd pick the next song."
        action={
          <AppButton onClick={() => navigate(routes.dj.createVote(eventId))}>
            Create a vote
          </AppButton>
        }
      />
    )
  }

  const { tallies, totalVotes } = results
  const tallyFor = (optionId: string) =>
    tallies.find((t) => t.optionId === optionId)?.votes ?? 0

  return (
    <>
      <div className="space-y-6">
        <p className="text-meta text-fg-subtle">
          {isActive ? 'Vote running' : 'Vote finished'} ·{' '}
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} cast
        </p>
        {isActive && (
          <AppCard emphasis padded={false}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-fg-muted">
                {round.endsAt ? 'Time left' : 'Runs until you end it'}
              </span>
              {secondsRemaining !== null && (
                <span className="text-2xl font-bold tabular-nums text-brand-400">
                  {formatCountdown(secondsRemaining)}
                </span>
              )}
            </div>
          </AppCard>
        )}

        <div className="space-y-3">
          {round.options.map((option) => (
            <div key={option.id} className="space-y-2">
              <VotingOptionCard
                option={option}
                votes={tallyFor(option.id)}
                totalVotes={totalVotes}
                isWinner={round.winnerOptionId === option.id}
                readOnly
              />
              {!isActive && round.status === 'ended' && (
                <div className="flex gap-2">
                  <AppButton
                    variant={
                      round.winnerOptionId === option.id
                        ? 'primary'
                        : 'secondary'
                    }
                    size="sm"
                    fullWidth
                    disabled={busy}
                    onClick={() => queueOption(option.id, true)}
                  >
                    Play next
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    fullWidth
                    disabled={busy}
                    onClick={() => queueOption(option.id, false)}
                  >
                    Add to queue
                  </AppButton>
                </div>
              )}
            </div>
          ))}
        </div>

        {isActive ? (
          <div className="space-y-2">
            <AppButton
              size="lg"
              fullWidth
              loading={busy}
              onClick={endEarly}
            >
              End vote now
            </AppButton>
            <AppButton
              variant="ghost"
              size="lg"
              fullWidth
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel vote
            </AppButton>
          </div>
        ) : (
          <AppButton
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => navigate(routes.dj.createVote(eventId))}
          >
            Start another vote
          </AppButton>
        )}
      </div>

      <ConfirmationDialog
        open={confirmCancel}
        title="Cancel this vote?"
        description="Guests stop seeing it and no winner is picked. Votes already cast are discarded."
        confirmLabel="Cancel vote"
        cancelLabel="Keep it running"
        destructive
        loading={busy}
        onConfirm={cancelRound}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  )
}

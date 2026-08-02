import { useParams } from 'react-router-dom'
import {
  AppCard,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  VotingOptionCard,
} from '../../components'
import { useVotingRound } from '../../features/voting-rounds/useVotingRound'
import { formatCountdown } from '../../utils/formatRelativeTime'

export function VotingRoundPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const { results, loading, secondsRemaining, castingOptionId, castVote } =
    useVotingRound(eventId)

  if (loading && !results) {
    return (
      <>
        <PageHeader title="Vote" />
        <main className="flex-1 space-y-3 px-4 py-4">
          <LoadingSkeleton className="h-20" />
          <LoadingSkeleton className="h-20" />
          <LoadingSkeleton className="h-20" />
        </main>
      </>
    )
  }

  if (!results) {
    return (
      <>
        <PageHeader title="Vote" />
        <main className="flex-1">
          <EmptyState
            title="No vote running"
            description="When the DJ starts a vote for the next song, it shows up here."
          />
        </main>
      </>
    )
  }

  const { round, tallies, totalVotes, myOptionId } = results
  const isActive = round.status === 'active'
  const tallyFor = (optionId: string) =>
    tallies.find((t) => t.optionId === optionId)?.votes ?? 0

  return (
    <>
      <PageHeader
        title={isActive ? 'Vote for the next song' : 'Vote results'}
        subtitle={
          isActive
            ? myOptionId
              ? 'Tap another song to change your vote.'
              : 'Pick one song.'
            : round.status === 'cancelled'
              ? 'The DJ cancelled this vote.'
              : 'This vote has ended.'
        }
      />

      <main className="flex-1 space-y-6 px-4 py-5">
        {isActive && secondsRemaining !== null && (
          <AppCard emphasis padded={false}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-fg-muted">Time left</span>
              <span
                className="text-2xl font-bold tabular-nums text-brand-400"
                // Announce only at the end rather than every second.
                aria-live={secondsRemaining <= 5 ? 'assertive' : 'off'}
              >
                {formatCountdown(secondsRemaining)}
              </span>
            </div>
          </AppCard>
        )}

        {isActive && round.endsAt === null && (
          <p className="text-sm text-fg-subtle">
            This vote runs until the DJ ends it.
          </p>
        )}

        <div className="space-y-3">
          {round.options.map((option) => (
            <VotingOptionCard
              key={option.id}
              option={option}
              votes={tallyFor(option.id)}
              totalVotes={totalVotes}
              selected={myOptionId === option.id}
              isWinner={round.winnerOptionId === option.id}
              readOnly={!isActive}
              pending={castingOptionId === option.id}
              onSelect={() => castVote(option.id)}
            />
          ))}
        </div>

        <p className="text-center text-sm text-fg-subtle">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} so far
        </p>

        {!isActive && round.status === 'ended' && !round.winnerOptionId && (
          <p className="text-center text-sm text-fg-muted">
            No votes were cast, so there's no winner.
          </p>
        )}
      </main>
    </>
  )
}

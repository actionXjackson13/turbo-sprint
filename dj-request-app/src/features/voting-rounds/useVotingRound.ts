import { useCallback, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useLiveData } from '../../hooks/useAsyncData'
import { useCountdown } from '../../hooks/useCountdown'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { haptic } from '../../utils/haptics'
import type { VotingRoundResults } from '../../types/domain'

export interface VotingRoundState {
  results: VotingRoundResults | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Seconds left, or null when the round has no automatic end. */
  secondsRemaining: number | null
  castingOptionId: string | null
  castVote: (optionId: string) => Promise<void>
}

/**
 * Loads the event's current (or most recent) voting round and keeps its tallies
 * live. When a timed round runs out, this asks the backend to finalise it — the
 * server decides the outcome, the countdown here is only a display.
 */
export function useVotingRound(eventId: string): VotingRoundState {
  const service = useService()
  const toast = useToast()
  const [castingOptionId, setCastingOptionId] = useState<string | null>(null)

  /**
   * The latest round, whatever state it is in — one query rather than two.
   *
   * This used to ask for the active round and then, on the usual answer of
   * "there isn't one", ask again for the most recent. Two round trips in
   * sequence, on every DJ screen, because the nav bar carries the vote badge.
   *
   * Asking only for the latest is equivalent: a unique index on
   * `voting_rounds` allows one active round per event, so a new round cannot
   * be started while one is running — which means an active round is always
   * the most recent one. Callers already read `round.status` to tell a running
   * vote from a finished one.
   */
  const loader = useCallback(async () => {
    const round = await service.getLatestVotingRound(eventId)
    if (!round) return null
    return service.getVotingRoundResults(round.id)
  }, [service, eventId])

  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeVotingRounds(eventId, onChange),
    [service, eventId],
  )

  const { data, loading, error, reload } = useLiveData(loader, subscribe)
  const round = data?.round ?? null

  const handleExpire = useCallback(() => {
    if (!round || round.status !== 'active') return
    void (async () => {
      try {
        await service.finalizeVotingRoundIfExpired(round.id)
      } catch {
        // Another client very likely finalised it first; the reload below
        // picks up whatever the server decided.
      }
      await reload()
    })()
  }, [service, round, reload])

  const secondsRemaining = useCountdown(
    round?.status === 'active' ? round.endsAt : null,
    handleExpire,
  )

  const castVote = useCallback(
    async (optionId: string) => {
      setCastingOptionId(optionId)
      haptic('tap')
      try {
        if (!round) return
        await service.castRoundVote(round.id, optionId)
        await reload()
      } catch (err) {
        toast.error(getErrorMessage(err))
        // A rejected vote usually means the round closed — resync.
        await reload()
      } finally {
        setCastingOptionId(null)
      }
    },
    [service, round, reload, toast],
  )

  return {
    results: data ?? null,
    loading,
    error,
    reload,
    secondsRemaining,
    castingOptionId,
    castVote,
  }
}

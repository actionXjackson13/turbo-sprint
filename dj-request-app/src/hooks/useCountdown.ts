import { useEffect, useState } from 'react'

/**
 * Ticks once a second toward `endsAt`, returning whole seconds remaining.
 *
 * This is display only. The authoritative check that a round has closed lives
 * in the database (an RLS predicate against the server's own clock), so a
 * client with a skewed clock cannot vote late by lying about the time.
 *
 * `onExpire` fires once when the countdown reaches zero — screens use it to
 * ask the backend to finalise the round.
 */
export function useCountdown(
  endsAt: string | null,
  onExpire?: () => void,
): number | null {
  const [remaining, setRemaining] = useState<number | null>(() =>
    computeRemaining(endsAt),
  )

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null)
      return
    }

    let fired = false
    const tick = () => {
      const next = computeRemaining(endsAt)
      setRemaining(next)
      if (next !== null && next <= 0 && !fired) {
        fired = true
        onExpire?.()
      }
    }

    // Run immediately so a round that is already expired on mount finalises
    // without waiting a full second.
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt, onExpire])

  return remaining
}

function computeRemaining(endsAt: string | null): number | null {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 1000))
}

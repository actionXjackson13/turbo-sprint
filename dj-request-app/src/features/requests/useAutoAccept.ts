import { useCallback, useEffect, useRef, useState } from 'react'
import type { SongRequest } from '../../types/domain'

/**
 * Taking every request without being asked.
 *
 * Most of the time a DJ approves nearly everything, and tapping through
 * requests one at a time is work that produces the same answer every time. This
 * turns that off: anything a guest sends is queued the moment it arrives.
 *
 * It runs on the DJ's own device, watching the same live request list the
 * screen draws — not as a rule on the server. That is a real limitation and
 * worth naming: with the app closed, nothing is auto-queued, and the backlog is
 * swept up when it next opens. A server-side rule would be a different feature,
 * and a much harder one to turn off in a hurry.
 *
 * Kept per device rather than per event for the same reason. It describes what
 * this phone does while it is awake, which is not a fact about the party.
 */

const KEY_PREFIX = 'soundboard.autoAccept.'

/** Long enough to outlast a blip, short enough that nobody notices the gap. */
const RETRY_DELAY_MS = 3_000

/** After this many in a row, the connection is the problem, not the song. */
const MAX_CONSECUTIVE_FAILURES = 3

export function isAutoAcceptOn(eventId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + eventId) === 'true'
  } catch {
    return false
  }
}

function persist(eventId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY_PREFIX + eventId, 'true')
    else localStorage.removeItem(KEY_PREFIX + eventId)
  } catch {
    // Storage blocked. The choice holds for this page view only.
  }
}

export interface AutoAcceptState {
  on: boolean
  setOn: (on: boolean) => void
  /** How many are being swept up right now, for the label. */
  working: number
}

export function useAutoAccept(
  eventId: string,
  requests: SongRequest[],
  queueRequest: (request: SongRequest) => Promise<void>,
): AutoAcceptState {
  const [on, setOnState] = useState(() => isAutoAcceptOn(eventId))
  const [working, setWorking] = useState(0)

  const setOn = useCallback(
    (next: boolean) => {
      setOnState(next)
      persist(eventId, next)
    },
    [eventId],
  )

  /**
   * Queueing triggers a reload, which re-runs this effect with the same request
   * still momentarily pending. Without a record of what has already been sent,
   * that is an unbounded run of writes rather than a queue.
   */
  const handled = useRef<Set<string>>(new Set())
  const busy = useRef(false)

  /**
   * Bumped after a failure to wake the sweep again.
   *
   * Without it a request that failed once would sit unqueued until some *other*
   * request arrived to change the waiting set — so a single network blip would
   * quietly drop somebody's song for the rest of the night.
   */
  const [retryTick, setRetryTick] = useState(0)
  const failures = useRef(0)

  // Both held in refs so the effect depends on neither. A fresh array or a
  // fresh closure on every render would otherwise cancel and restart the sweep
  // continuously — including the sweep's own `setWorking` re-render, which was
  // enough to stop it ever reaching the first request.
  const requestsRef = useRef(requests)
  requestsRef.current = requests
  const queueRef = useRef(queueRequest)
  queueRef.current = queueRequest

  const waitingFor = (request: SongRequest) =>
    request.status === 'pending' || request.status === 'accepted'

  /**
   * What is waiting, as a value rather than a reference.
   *
   * The effect keys off this so it wakes when the *set* of waiting requests
   * changes and stays asleep through every other render.
   */
  const waitingKey = requests
    .filter(waitingFor)
    .map((r) => r.id)
    .join(',')

  useEffect(() => {
    if (!on || busy.current) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    busy.current = true

    void (async () => {
      try {
        // Re-read the list each time around rather than working from a snapshot
        // taken before the first write: requests keep arriving during a sweep,
        // and one taken mid-sweep should not have to wait for the next wake-up.
        for (;;) {
          if (cancelled) break
          const remaining = requestsRef.current.filter(
            (r) => waitingFor(r) && !handled.current.has(r.id),
          )
          setWorking(remaining.length)
          const next = remaining[0]
          if (!next) break

          handled.current.add(next.id)
          try {
            // One at a time: each queueing reads the queue back to place the
            // song correctly, and firing them together would have every one of
            // them reading the same stale order.
            await queueRef.current(next)
            failures.current = 0
          } catch {
            // Let a later pass retry it rather than stalling the whole sweep.
            handled.current.delete(next.id)
            failures.current += 1
            /**
             * Three in a row means the problem is the connection, not the song.
             * Backing off there stops a dead service turning into a toast every
             * few seconds; the next request to arrive wakes it again.
             */
            if (failures.current < MAX_CONSECUTIVE_FAILURES) {
              retryTimer = setTimeout(
                () => setRetryTick((t) => t + 1),
                RETRY_DELAY_MS,
              )
            }
            break
          }
        }
      } finally {
        busy.current = false
        if (!cancelled) setWorking(0)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [on, waitingKey, retryTick])

  // Turning it off and on again should re-sweep anything declined in between.
  useEffect(() => {
    if (!on) {
      handled.current.clear()
      failures.current = 0
    }
  }, [on])

  return { on, setOn, working }
}

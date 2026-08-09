import { useCallback, useEffect, useRef, useState } from 'react'
import type { SongRequest } from '../../types/domain'
import { isBlocked } from './blocklist'

/**
 * Taking every request without being asked.
 *
 * Most of the time a DJ approves nearly everything, and tapping through
 * requests one at a time is work that produces the same answer every time. This
 * turns that off: anything a guest sends is queued the moment it arrives.
 *
 * It runs wherever it is mounted rather than on the requests screen, because a
 * DJ watching the queue or running a vote is still a DJ whose guests are still
 * asking for songs — see AutoAcceptProvider. With the app closed nothing is
 * queued, and the backlog is swept when it next opens.
 *
 * Kept per device rather than per event, honestly: it describes what this phone
 * does while it is awake, which is not a fact about the party.
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
  /** How many are still to be swept up, for the label. */
  working: number
}

function isWaiting(request: SongRequest): boolean {
  return request.status === 'pending' || request.status === 'accepted'
}

export function useAutoAccept(
  eventId: string,
  requests: SongRequest[],
  queueRequest: (request: SongRequest) => Promise<void>,
  declineRequest: (request: SongRequest) => Promise<void>,
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
   * Queueing triggers a reload, and for a moment the request is still pending —
   * so without a record of what has already been sent this is an unbounded run
   * of writes rather than a queue.
   */
  const handled = useRef<Set<string>>(new Set())
  const busy = useRef(false)
  const failures = useRef(0)

  /**
   * Stopping is tied to unmount and to the switch, and to nothing else.
   *
   * It used to be tied to the effect that *starts* a sweep, which meant the
   * list changing cancelled the very sweep that had just changed it: the first
   * song queued, the reload landed, the effect re-ran, its cleanup cancelled
   * the loop mid-flight, and the re-run found `busy` still true and did
   * nothing. One song, then silence until the screen was reopened.
   */
  const stopped = useRef(!on)

  // Held in refs so neither identity can retrigger anything.
  const requestsRef = useRef(requests)
  requestsRef.current = requests
  const queueRef = useRef(queueRequest)
  queueRef.current = queueRequest
  const declineRef = useRef(declineRequest)
  declineRef.current = declineRequest

  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [retryTick, setRetryTick] = useState(0)

  /**
   * Drain everything waiting, re-reading the list each time around.
   *
   * Requests keep arriving during a sweep, and one that lands mid-sweep should
   * not have to wait for the next wake-up — so this loops on live state rather
   * than on a snapshot taken before the first write.
   */
  const sweep = useCallback(async () => {
    if (busy.current || stopped.current) return
    busy.current = true

    try {
      for (;;) {
        if (stopped.current) break

        const remaining = requestsRef.current.filter(
          (r) => isWaiting(r) && !handled.current.has(r.id),
        )
        setWorking(remaining.length)

        const next = remaining[0]
        if (!next) break

        handled.current.add(next.id)
        try {
          // The blocklist is what makes leaving this switch on safe: without
          // it, "accept everything" really does mean everything, including the
          // running joke someone has decided to request eleven times.
          if (isBlocked(next)) {
            await declineRef.current(next)
          } else {
            // One at a time: each queueing reads the queue back to place the
            // song correctly, and firing them together would have every one of
            // them working from the same stale order.
            await queueRef.current(next)
          }
          failures.current = 0
        } catch {
          // Let a later pass retry rather than dropping the song for good.
          handled.current.delete(next.id)
          failures.current += 1
          /**
           * Three in a row means the connection is the problem, not the song.
           * Backing off there stops a dead service becoming a toast every few
           * seconds; the next request to arrive wakes it again.
           */
          if (failures.current < MAX_CONSECUTIVE_FAILURES) {
            clearTimeout(retryTimer.current)
            retryTimer.current = setTimeout(
              () => setRetryTick((t) => t + 1),
              RETRY_DELAY_MS,
            )
          }
          break
        }
      }
    } finally {
      busy.current = false
      if (!stopped.current) setWorking(0)
    }
  }, [])

  /** The switch, and unmounting, are the only things that stop a sweep. */
  useEffect(() => {
    stopped.current = !on
    if (!on) {
      // Forget what was handled so switching back on re-sweeps anything that
      // came and went while it was off.
      handled.current.clear()
      failures.current = 0
      clearTimeout(retryTimer.current)
      setWorking(0)
    }
    return () => {
      stopped.current = true
      clearTimeout(retryTimer.current)
    }
  }, [on])

  /**
   * What is waiting, as a value rather than a reference — so this wakes when
   * the *set* changes and sleeps through every other render.
   */
  const waitingKey = requests
    .filter(isWaiting)
    .map((r) => r.id)
    .join(',')

  useEffect(() => {
    if (!on) return
    void sweep()
  }, [on, waitingKey, retryTick, sweep])

  return { on, setOn, working }
}

import type { DataService, Unsubscribe } from '../../services/types'
import { getErrorMessage } from '../../utils/errors'
import type { RequestSort, RequestStatus, SongRequest } from '../../types/domain'

/**
 * One copy of an event's requests, however many screens are looking at it.
 *
 * Measured on the DJ's control panel: opening it made twelve calls to the
 * backend, and six of them were exact duplicates fired in the same instant.
 * Three of those were this list — the auto-accept watcher, the player and the
 * screen itself each loaded it independently, because each called the hook and
 * the hook fetched. Two more were the "my votes" lookup riding along with each
 * of them, for a DJ who has no votes and never will.
 *
 * Nothing was wrong with any one of those call sites; they were all asking a
 * reasonable question. What was missing was somewhere for the answer to live.
 * This is that: subscribers share a single load, a single realtime
 * subscription, and a single refresh.
 *
 * Sorting and status filtering moved to the callers (`selectRequests` below).
 * The query never had a limit, so every variant was fetching the same rows in
 * a different order — the ordering was the only thing that differed, and it is
 * cheaper to do once the rows are here than to ask again for them.
 *
 * Keyed by service *and* event: demo, Supabase and the guest-preview client
 * are different backends with different identities, and their answers must not
 * be handed to each other.
 */

export interface EventRequestsData {
  requests: SongRequest[]
  /** Request ids the current viewer has voted for. Empty for a DJ. */
  votes: string[]
}

export interface EventRequestsSnapshot {
  data: EventRequestsData | null
  loading: boolean
  error: string | null
}

interface Entry {
  listeners: Set<() => void>
  snapshot: EventRequestsSnapshot
  /** The load currently running, so simultaneous callers await one request. */
  inFlight: Promise<void> | null
  /** When the rows last arrived, so a quick glance away costs nothing. */
  lastLoad: number
  unsubscribe: Unsubscribe | null
}

const EMPTY: EventRequestsSnapshot = { data: null, loading: true, error: null }

/**
 * How long rows are trusted after the app is returned to.
 *
 * Long enough that switching apps to read a message does not reload the party;
 * short enough that a phone left in a pocket through two songs comes back
 * current.
 */
const STALE_AFTER_MS = 15_000

let stores = new WeakMap<DataService, Map<string, Entry>>()

function entryFor(service: DataService, eventId: string): Entry {
  let byEvent = stores.get(service)
  if (!byEvent) {
    byEvent = new Map()
    stores.set(service, byEvent)
  }

  let entry = byEvent.get(eventId)
  if (!entry) {
    entry = {
      listeners: new Set(),
      snapshot: EMPTY,
      inFlight: null,
      lastLoad: 0,
      unsubscribe: null,
    }
    byEvent.set(eventId, entry)
  }
  return entry
}

function publish(entry: Entry, next: Partial<EventRequestsSnapshot>): void {
  // A fresh object each time, because `useSyncExternalStore` compares
  // snapshots by identity — and the same object back would mean no re-render.
  entry.snapshot = { ...entry.snapshot, ...next }
  for (const listener of entry.listeners) listener()
}

/**
 * Loads the list, or joins the load already running.
 *
 * The de-duplication is the point: three hooks mounting in the same render
 * pass all call this, and exactly one request goes out.
 */
export function reloadEventRequests(
  service: DataService,
  eventId: string,
): Promise<void> {
  const entry = entryFor(service, eventId)
  if (entry.inFlight) return entry.inFlight

  const run = (async () => {
    // Only announce loading when there is nothing to show. A refresh behind a
    // list that is already on screen must not replace it with a skeleton.
    if (!entry.snapshot.data) publish(entry, { loading: true })

    try {
      const [requests, votes] = await Promise.all([
        service.listSongRequests(eventId),
        service.getMyRequestVotes(eventId),
      ])
      entry.lastLoad = Date.now()
      publish(entry, { data: { requests, votes }, loading: false, error: null })
    } catch (err) {
      publish(entry, { loading: false, error: getErrorMessage(err) })
    } finally {
      entry.inFlight = null
    }
  })()

  entry.inFlight = run
  return run
}

/**
 * Watch the list. The first watcher starts it; the last one stops it.
 *
 * The realtime subscription is shared for the same reason the fetch is: a
 * socket can only join a topic once, and three screens each asking for their
 * own would leave two of them silently stale.
 */
export function subscribeEventRequests(
  service: DataService,
  eventId: string,
  listener: () => void,
): Unsubscribe {
  const entry = entryFor(service, eventId)
  const first = entry.listeners.size === 0
  entry.listeners.add(listener)

  if (first) {
    const live = service.subscribeSongRequests(eventId, () => {
      entry.lastLoad = Date.now()
      void reloadEventRequests(service, eventId)
    })

    /**
     * Catching up after the phone has been asleep.
     *
     * The socket is dropped while a tab is hidden and reconnected when it
     * comes back, and anything that happened in between arrives nowhere. So a
     * return to the app asks once — but only after a real absence. A DJ
     * glancing at a text and coming straight back used to trigger a full
     * reload of every screen, which is most of why the app felt slow to
     * return to.
     */
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - entry.lastLoad < STALE_AFTER_MS) return
      void reloadEventRequests(service, eventId)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)

    entry.unsubscribe = () => {
      live()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }

    void reloadEventRequests(service, eventId)
  }

  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size > 0) return

    entry.unsubscribe?.()
    entry.unsubscribe = null
    /**
     * The rows are kept, deliberately.
     *
     * Moving between the DJ's tabs unmounts every watcher for an instant, and
     * throwing the list away there is exactly what made each tab open on a
     * skeleton. Keeping it means the next screen paints immediately and
     * refreshes underneath.
     */
  }
}

/**
 * Refresh only if the rows have had time to go wrong.
 *
 * Screens mount constantly — every tab switch remounts several — and each one
 * asking for a fresh load is how the app ended up making the same request
 * repeatedly for data it already had and that a live subscription was already
 * keeping current.
 */
export function reloadEventRequestsIfStale(
  service: DataService,
  eventId: string,
): void {
  const entry = entryFor(service, eventId)
  if (entry.snapshot.data && Date.now() - entry.lastLoad < STALE_AFTER_MS) {
    return
  }
  void reloadEventRequests(service, eventId)
}

export function getEventRequestsSnapshot(
  service: DataService,
  eventId: string,
): EventRequestsSnapshot {
  return entryFor(service, eventId).snapshot
}

/**
 * Everything each screen actually wanted, shaped from the one shared list.
 *
 * This is the work that used to be a separate query per ordering. The list is
 * already here and has no limit on it, so every variant was fetching the same
 * rows and only the ORDER BY differed.
 */
export function selectRequests(
  requests: SongRequest[],
  opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
): SongRequest[] {
  const statuses = opts?.statuses
  const filtered =
    statuses && statuses.length > 0
      ? requests.filter((r) => statuses.includes(r.status))
      : requests

  // Copied before sorting: the shared array is handed to every screen, and
  // sorting in place would reorder it under the others.
  const sorted = [...filtered]
  sorted.sort(
    opts?.sort === 'votes'
      ? (a, b) => b.voteCount - a.voteCount || newestFirst(a, b)
      : newestFirst,
  )
  return sorted
}

function newestFirst(a: SongRequest, b: SongRequest): number {
  return b.createdAt.localeCompare(a.createdAt)
}

/** Drops everything. For tests, and for signing out. */
export function __resetEventRequests(): void {
  // A WeakMap cannot be walked, so the whole thing is replaced instead.
  stores = new WeakMap()
}

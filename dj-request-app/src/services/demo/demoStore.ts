import type {
  DjSet,
  EventGuest,
  EventRecord,
  Profile,
  RequestVote,
  SongRequest,
  VotingOption,
  VotingResponse,
  VotingRound,
} from '../../types/domain'
import { buildSeed, DEMO_GUEST_USER_ID } from './seed'

/**
 * In-memory database for demo mode, mirrored into localStorage.
 *
 * Persisting matters: the spec requires a guest session and their requests to
 * survive a refresh, and demo mode has no server to fall back on. The shape
 * below deliberately mirrors the Postgres schema (rounds and options are
 * separate tables, votes are rows rather than counters) so DemoService and
 * SupabaseService can implement identical semantics.
 */

/** A round as stored — options live in their own collection, as in Postgres. */
export type StoredVotingRound = Omit<VotingRound, 'options'>

export interface DemoDb {
  profiles: Profile[]
  events: EventRecord[]
  guests: EventGuest[]
  requests: SongRequest[]
  requestVotes: RequestVote[]
  rounds: StoredVotingRound[]
  votingOptions: VotingOption[]
  votingResponses: VotingResponse[]
  /** The DJ's reusable song lists. Not scoped to any event. */
  djSets: DjSet[]
  /** Signed-in DJ, persisted so a refresh keeps the demo DJ logged in. */
  currentDjId: string | null
}

const STORAGE_KEY = 'soundboard.demoDb.v2'

/**
 * Which guest the demo is currently acting as.
 *
 * Deliberately *not* part of DemoDb: the database is mirrored into
 * localStorage and synced across tabs, so storing the active guest there would
 * make every open tab switch together. Keeping it in sessionStorage instead
 * gives each tab its own identity — open three tabs and be three different
 * guests — while still surviving a refresh.
 */
const ACTIVE_GUEST_KEY = 'soundboard.demoActiveGuest'

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Fill in anything a stored database predates.
 *
 * The demo database lives in localStorage and outlives the code that wrote it:
 * someone who used the app last week reloads it today and gets last week's
 * shape back. Every collection added since then is simply absent, and the first
 * write to one throws — which is exactly how sets shipped broken for anyone who
 * had opened the app before, while working perfectly on a fresh browser.
 *
 * Repairing beats rejecting. The obvious alternative, bumping the storage key,
 * would take the DJ's event, its requests, its guests and its queue with it —
 * a working party wiped to add a feature nobody had used yet.
 */
function normalize(stored: Partial<DemoDb>): DemoDb {
  const seed = buildSeed()
  return {
    profiles: stored.profiles ?? seed.profiles,
    // Events stored before themes existed come back without the field.
    events: (stored.events ?? seed.events).map((e) => ({
      ...e,
      theme: e.theme ?? null,
    })),
    guests: stored.guests ?? seed.guests,
    requests: stored.requests ?? seed.requests,
    requestVotes: stored.requestVotes ?? seed.requestVotes,
    rounds: stored.rounds ?? seed.rounds,
    votingOptions: stored.votingOptions ?? seed.votingOptions,
    votingResponses: stored.votingResponses ?? seed.votingResponses,
    // Added after the storage format was already in the wild, so it is the one
    // most likely to be missing — and the reason this function exists.
    djSets: stored.djSets ?? [],
    currentDjId: stored.currentDjId ?? null,
  }
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoDb>
      // The two that must be present for this to be a database at all rather
      // than something else entirely; everything else is repaired above.
      if (Array.isArray(parsed.events) && Array.isArray(parsed.requests)) {
        return normalize(parsed)
      }
    }
  } catch {
    // Corrupt or unavailable storage — fall through to a fresh seed.
  }
  return buildSeed()
}

function loadActiveGuest(): string {
  try {
    return sessionStorage.getItem(ACTIVE_GUEST_KEY) ?? DEMO_GUEST_USER_ID
  } catch {
    return DEMO_GUEST_USER_ID
  }
}

let db: DemoDb = load()
let activeGuestUserId: string = loadActiveGuest()

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Storage full or blocked; the in-memory copy still works for this session.
  }
}

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

/** Channel keys mirror the realtime topics used by SupabaseService. */
export const channels = {
  requests: (eventId: string) => `requests:${eventId}`,
  rounds: (eventId: string) => `rounds:${eventId}`,
  event: (eventId: string) => `event:${eventId}`,
  /**
   * Demo-only: the acting guest changed, or the roster gained a member. Has no
   * Supabase counterpart because a real client is only ever one person.
   */
  identity: 'demo:identity',
}

export function subscribe(channel: string, listener: Listener): () => void {
  const set = listeners.get(channel) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(channel, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(channel)
  }
}

function emit(...channelNames: string[]): void {
  for (const name of channelNames) {
    const set = listeners.get(name)
    if (!set) continue
    // Copy before iterating: a listener may unsubscribe during dispatch.
    for (const listener of [...set]) listener()
  }
}

/**
 * Wakes every listener. Used for changes that aren't scoped to one channel —
 * a reset, a cross-tab sync, or switching which guest the demo is acting as
 * (which re-scopes "my requests" and "my votes" on every screen at once).
 */
function emitAll(): void {
  emit(...listeners.keys())
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export function getDb(): DemoDb {
  return db
}

/**
 * The guest identity every "is this mine?" lookup in DemoService resolves
 * against. Against Supabase the equivalent is the anonymous auth uid, which
 * the client cannot choose — being able to swap it is precisely what makes the
 * demo able to act as more than one person.
 */
export function getActiveGuestUserId(): string {
  return activeGuestUserId
}

export function setActiveGuestUserId(guestUserId: string): void {
  if (guestUserId === activeGuestUserId) return
  activeGuestUserId = guestUserId
  try {
    sessionStorage.setItem(ACTIVE_GUEST_KEY, guestUserId)
  } catch {
    // Storage unavailable — the switch still holds for this page view.
  }
  emitAll()
}

/**
 * Answer one call as somebody else, without telling anyone.
 *
 * `setActiveGuestUserId` above is the demo's persona switcher: it persists the
 * choice and wakes every screen, because a person deciding to be Priya expects
 * the whole app to re-scope around her. A host binding a remote guest's
 * identity for the length of one call wants none of that.
 *
 * Using the switcher for it was catastrophic, and not obviously so. Each call
 * bound an identity and then restored it — two notifications, each waking the
 * host's channel subscriptions, each broadcasting "something changed" to every
 * connected guest, each of whom reloaded every screen, issuing a fresh burst
 * of calls that did the same thing again. One guest asking one question was
 * enough to start it. From a phone it looked like the party loading forever
 * and then dropping out, because the queue behind it never emptied.
 *
 * So this writes the variable and puts it back, and the only things that
 * announce a change are the ones that actually changed something.
 */
export async function asGuest<T>(
  guestUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = activeGuestUserId
  activeGuestUserId = guestUserId
  try {
    return await fn()
  } finally {
    activeGuestUserId = previous
  }
}

/**
 * Applies a mutation, persists, and notifies the given channels.
 * Every write in DemoService goes through here so nothing can change without
 * subscribers hearing about it.
 */
export function mutate<T>(fn: (db: DemoDb) => T, ...notify: string[]): T {
  const result = fn(db)
  persist()
  emit(...notify)
  return result
}

/**
 * Cross-tab sync for demo mode.
 *
 * Supabase realtime propagates changes between devices; localStorage's
 * `storage` event is the equivalent between tabs of the same browser. Without
 * this you could not demonstrate a DJ accepting a request and the guest's
 * screen updating live, because demo mode has no server to push from.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      db = JSON.parse(event.newValue) as DemoDb
    } catch {
      return
    }
    emitAll()
  })
}

/** Restores the original sample data. Exposed via the demo settings screen. */
export function resetDemoDb(): void {
  db = buildSeed()
  persist()

  // The roster is rebuilt, so any guest added during the session no longer
  // exists — drop back to the seeded identity rather than a dangling one.
  activeGuestUserId = DEMO_GUEST_USER_ID
  try {
    sessionStorage.removeItem(ACTIVE_GUEST_KEY)
  } catch {
    /* no-op */
  }

  // Wake every listener — the whole world just changed.
  emitAll()
}

/**
 * Whether to fake network latency.
 *
 * Worth having in the sandbox and actively harmful in a real party: a hosting
 * phone serialises its guests' calls, so 140ms of pretend network on each one
 * stacks up across every screen of every guest into a wait that looks like the
 * app not loading. Nobody needs a simulated delay on a connection that has a
 * real one.
 */
let simulateLatency = true

export function setDemoLatency(enabled: boolean): void {
  simulateLatency = enabled
}

/**
 * Simulates network latency so loading skeletons and pending states are
 * actually exercised in demo mode rather than resolving instantly.
 */
export function demoDelay(ms = 140): Promise<void> {
  if (!simulateLatency) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function nowIso(): string {
  return new Date().toISOString()
}

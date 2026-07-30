import type {
  EventGuest,
  EventRecord,
  Profile,
  RequestVote,
  SongRequest,
  VotingOption,
  VotingResponse,
  VotingRound,
} from '../../types/domain'
import { buildSeed } from './seed'

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
  /** Signed-in DJ, persisted so a refresh keeps the demo DJ logged in. */
  currentDjId: string | null
  /** The demo guest's stable identity. */
  guestUserId: string
}

const STORAGE_KEY = 'soundboard.demoDb.v1'

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb
      // Guard against a stale shape from an earlier version of the seed.
      if (Array.isArray(parsed.events) && Array.isArray(parsed.requests)) {
        return parsed
      }
    }
  } catch {
    // Corrupt or unavailable storage — fall through to a fresh seed.
  }
  return buildSeed()
}

let db: DemoDb = load()

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

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export function getDb(): DemoDb {
  return db
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

/** Restores the original sample data. Exposed via the demo settings screen. */
export function resetDemoDb(): void {
  db = buildSeed()
  persist()
  // Wake every listener — the whole world just changed.
  for (const name of [...listeners.keys()]) emit(name)
}

/**
 * Simulates network latency so loading skeletons and pending states are
 * actually exercised in demo mode rather than resolving instantly.
 */
export function demoDelay(ms = 140): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Core domain model.
 *
 * This file is deliberately free of React/DOM imports so it can be shared
 * verbatim with a future React Native client.
 */

export type RequestStatus =
  | 'pending'
  | 'accepted'
  | 'queued'
  | 'played'
  | 'declined'

/** Statuses that count toward a guest's active-request cap. */
export const ACTIVE_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'queued',
] as const satisfies readonly RequestStatus[]

export type ActiveRequestStatus = (typeof ACTIVE_REQUEST_STATUSES)[number]

/** Whether the DJ is currently taking new requests. */
export type RequestIntakeStatus = 'open' | 'paused' | 'closed'

export type EventStatus = 'active' | 'ended'

export type VotingRoundStatus = 'active' | 'ended' | 'cancelled'

/** A DJ account. Guests never have a profile row. */
export interface Profile {
  id: string
  displayName: string
  createdAt: string
}

export interface NowPlaying {
  title: string
  artist: string
  /** Set when the track was promoted from a request, so it can be marked played. */
  sourceRequestId: string | null
  /**
   * Copied from the request when the track was set, not read back through it —
   * a track can have no request behind it, and a request can be deleted while
   * its song is still playing.
   */
  artworkUrl: string | null
}

export interface EventRecord {
  id: string
  djId: string
  /** Denormalised for display on the guest Event Home. */
  djDisplayName: string
  name: string
  /** Short, human-shareable join code (uppercase). */
  code: string
  status: EventStatus
  requestStatus: RequestIntakeStatus
  nowPlaying: NowPlaying | null
  createdAt: string
  endedAt: string | null
}

export interface EventGuest {
  id: string
  eventId: string
  /** The guest's verified auth identity (anonymous Supabase user id). */
  guestUserId: string
  displayName: string
  isBlocked: boolean
  joinedAt: string
}

export interface SongRequest {
  id: string
  eventId: string
  /** null when the DJ promoted a voting-round winner rather than a guest asking. */
  guestId: string | null
  /** Snapshot of the requester's name at submit time. */
  guestDisplayName: string
  title: string
  artist: string
  /** Server-maintained. Never written by the client. */
  voteCount: number
  status: RequestStatus
  /**
   * Manual ordering within the queue. Only meaningful when status is 'queued';
   * null otherwise. Lower sorts first.
   */
  queuePosition: number | null
  /** Set when this row was created by promoting a voting-round winner. */
  sourceRoundId: string | null
  /**
   * Apple catalogue identity, when the guest picked a song from search rather
   * than typing it. Nullable throughout: requests predating search, and vote
   * winners the DJ typed in, have no catalogue entry and must still work.
   */
  catalogId: string | null
  artworkUrl: string | null
  /** Opens the track in Apple Music. */
  catalogUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface RequestVote {
  id: string
  requestId: string
  guestId: string
  /** The submitter's automatic vote. Cannot be withdrawn. */
  isFoundingVote: boolean
  createdAt: string
}

export interface VotingOption {
  id: string
  roundId: string
  title: string
  artist: string
  displayOrder: number
}

export interface VotingRound {
  id: string
  eventId: string
  status: VotingRoundStatus
  /** null means the round has no automatic end. */
  durationSeconds: number | null
  startsAt: string
  /** null when durationSeconds is null. */
  endsAt: string | null
  winnerOptionId: string | null
  endedAt: string | null
  createdAt: string
  options: VotingOption[]
}

export interface VotingResponse {
  id: string
  roundId: string
  optionId: string
  guestId: string
  createdAt: string
  updatedAt: string
}

/** Aggregate tally. Computed from vote records, never sent by a client. */
export interface VotingTally {
  optionId: string
  votes: number
}

export interface VotingRoundResults {
  round: VotingRound
  tallies: VotingTally[]
  totalVotes: number
  /** The current guest's choice, if they have voted. */
  myOptionId: string | null
}

/** Sort orders offered on the request lists. */
export type RequestSort = 'newest' | 'votes'

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

/**
 * The colours the room is wearing tonight.
 *
 * Only two are stored. Every other shade the app paints is derived from these
 * at render time, which is what keeps a DJ from choosing a pair that makes text
 * unreadable — see `features/theme/palette`.
 */
export interface EventTheme {
  /** Buttons, links, the active tab. */
  primary: string
  /** Highlights, dividers, the second voice. */
  accent: string
}

/** A short, timed note from the DJ to everyone in the room. */
export interface Announcement {
  message: string
  /** When it stops being shown. Set by the server from a duration. */
  expiresAt: string
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
  /**
   * Present whether or not it has expired — screens decide that against the
   * clock, so a message ending does not need a round trip to notice.
   */
  announcement: Announcement | null
  /**
   * Set by the DJ, applied to everyone. Null means the app's own colours —
   * events created before themes existed, and DJs who never changed it.
   */
  theme: EventTheme | null
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
   * null otherwise. Lower sorts first, within the song's group.
   */
  queuePosition: number | null
  /** Which half of the queue this sits in. Only meaningful while queued. */
  queueGroup: QueueGroup
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

/** One song inside a DJ's set. */
export interface DjSetSong {
  id: string
  setId: string
  title: string
  artist: string
  displayOrder: number
  /** The same catalogue trio songs carry everywhere, so artwork survives. */
  catalogId: string | null
  artworkUrl: string | null
  catalogUrl: string | null
}

/**
 * A named list of songs the DJ built ahead of time.
 *
 * Owned by the DJ rather than by an event, which is the whole point: a set
 * built once is the same set next Friday. Loading it into a queue copies its
 * songs, so editing it later never rewrites a night already played.
 */
export interface DjSet {
  id: string
  djId: string
  name: string
  songs: DjSetSong[]
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
  /**
   * Set when the DJ picked the option out of the catalogue rather than typing
   * it. Nullable and staying that way — typing one in is still allowed, and
   * rounds created before search reached this screen have none.
   */
  catalogId: string | null
  artworkUrl: string | null
  catalogUrl: string | null
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

/**
 * Which half of the queue a song sits in.
 *
 * `main` is what plays next; `sub` is the backdrop a loaded set lands in.
 * Stored rather than derived from who added the song, so a DJ who promotes one
 * track out of a set has it stay promoted — above every request that arrives
 * afterwards, and still behind the ones already waiting.
 */
export type QueueGroup = 'main' | 'sub'

/** Sort orders offered on the request lists. */
export type RequestSort = 'newest' | 'votes'

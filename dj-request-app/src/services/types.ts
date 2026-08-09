import type {
  DjSet,
  QueueGroup,
  EventGuest,
  EventRecord,
  Profile,
  RequestIntakeStatus,
  RequestSort,
  RequestStatus,
  SongRequest,
  VotingRound,
  VotingRoundResults,
} from '../types/domain'

/**
 * The single data contract for the whole app.
 *
 * Two implementations exist — `DemoService` (in-memory, no backend) and
 * `SupabaseService` (Postgres + RLS + realtime). Screens depend only on this
 * interface, which is what makes the app runnable with zero configuration and
 * what would let a React Native client reuse this layer untouched.
 *
 * Errors are thrown as `ServiceError` so the UI can show a specific message
 * rather than a generic failure.
 */

export type ServiceErrorCode =
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'blocked'
  | 'requests_closed'
  | 'limit_reached'
  | 'duplicate'
  | 'round_closed'
  | 'invalid_input'
  | 'network'
  | 'unknown'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
  }
}

/** Cleanup handle returned by every subscribe* method. */
export type Unsubscribe = () => void

export interface GuestIdentity {
  /** Verified user id (anonymous auth uid in Supabase mode). */
  guestUserId: string
}

export interface CreateRequestInput {
  eventId: string
  title: string
  artist: string
  /** Set when the song came from catalogue search rather than free text. */
  catalogId?: string | null
  artworkUrl?: string | null
  catalogUrl?: string | null
}

/** One song going into a set. Same shape a catalogue result arrives in. */
export interface DjSetSongInput {
  title: string
  artist: string
  catalogId?: string | null
  artworkUrl?: string | null
  catalogUrl?: string | null
}

/** A song the DJ is adding themselves, rather than a guest requesting one. */
export interface DjSongInput {
  eventId: string
  title: string
  artist: string
  /** Carried through when the song came from search — see CatalogSong. */
  catalogId?: string | null
  artworkUrl?: string | null
  catalogUrl?: string | null
}

export interface VotingOptionInput {
  title: string
  artist: string
  /** Carried through when the option came from search — see CatalogSong. */
  catalogId?: string | null
  artworkUrl?: string | null
  catalogUrl?: string | null
}

export interface CreateVotingRoundInput {
  eventId: string
  options: VotingOptionInput[]
  /** null means the round has no automatic end. */
  durationSeconds: number | null
}

export interface EventSettingsPatch {
  name?: string
  requestStatus?: RequestIntakeStatus
}

export interface DataService {
  // ---- DJ authentication -------------------------------------------------
  signUpDj(
    email: string,
    password: string,
    displayName: string,
  ): Promise<Profile>
  signInDj(email: string, password: string): Promise<Profile>
  signOutDj(): Promise<void>
  getCurrentDjProfile(): Promise<Profile | null>
  /** Fires on sign-in/sign-out. Returns an unsubscribe handle. */
  onDjAuthStateChange(cb: (profile: Profile | null) => void): Unsubscribe

  // ---- Guest identity ----------------------------------------------------
  /**
   * Ensures the guest has a persistent, server-verifiable identity.
   * Safe to call repeatedly; returns the same id for the same browser.
   */
  getOrCreateGuestIdentity(): Promise<GuestIdentity>

  // ---- Events ------------------------------------------------------------
  createEvent(name: string): Promise<EventRecord>
  getDjEvents(): Promise<EventRecord[]>
  getEventById(eventId: string): Promise<EventRecord | null>
  getEventByCode(code: string): Promise<EventRecord | null>
  updateEventSettings(
    eventId: string,
    patch: EventSettingsPatch,
  ): Promise<EventRecord>
  setNowPlaying(
    eventId: string,
    nowPlaying: {
      title: string
      artist: string
      sourceRequestId: string | null
      artworkUrl?: string | null
    } | null,
  ): Promise<EventRecord>
  endEvent(eventId: string): Promise<EventRecord>
  /**
   * DJ-only. Posts a message to every guest for `durationSeconds`, or clears
   * the current one when passed null.
   *
   * The caller sends a duration rather than an expiry so the server's clock
   * decides when it ends — the same reasoning as voting rounds.
   */
  setAnnouncement(
    eventId: string,
    input: { message: string; durationSeconds: number } | null,
  ): Promise<EventRecord>
  /** Event row changes (intake status, now playing, ended). */
  subscribeEvent(eventId: string, onChange: () => void): Unsubscribe

  // ---- Guest membership --------------------------------------------------
  /** Joins (or rejoins) an event by code. Idempotent per guest. */
  joinEvent(code: string, displayName: string): Promise<{
    event: EventRecord
    guest: EventGuest
  }>
  /** The current guest's membership row, or null if they have not joined. */
  getGuestSession(eventId: string): Promise<EventGuest | null>
  getEventGuestCount(eventId: string): Promise<number>
  /**
   * Everyone who has joined. DJ-only in practice: RLS lets a guest read just
   * their own membership row, so this returns a single entry for a guest.
   */
  listEventGuests(eventId: string): Promise<EventGuest[]>
  /** DJ-only. Prevents the guest from submitting further requests. */
  setGuestBlocked(
    eventId: string,
    guestId: string,
    blocked: boolean,
  ): Promise<void>

  // ---- Song requests -----------------------------------------------------
  listSongRequests(
    eventId: string,
    opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
  ): Promise<SongRequest[]>
  getSongRequest(requestId: string): Promise<SongRequest | null>
  /** Requests submitted by the current guest. */
  getMyRequests(eventId: string): Promise<SongRequest[]>
  /**
   * Looks for an existing request at this event matching the normalised
   * title/artist, so the UI can nudge the guest to upvote instead.
   */
  findSimilarRequest(
    eventId: string,
    title: string,
    artist: string,
  ): Promise<SongRequest | null>
  /** Creates the request and the submitter's founding vote atomically. */
  createSongRequest(input: CreateRequestInput): Promise<SongRequest>
  /**
   * DJ-only. Puts one of the DJ's own songs straight into the queue.
   *
   * Skips 'pending' deliberately: a request is pending because someone has to
   * approve it, and here that someone is whoever just added it. It carries no
   * guest and no founding vote — it is not the room asking, so it should not
   * appear to have been asked for.
   */
  addDjSong(input: DjSongInput): Promise<SongRequest>

  // ---- The DJ's sets -----------------------------------------------------
  /**
   * Named song lists the DJ builds beforehand, so most of a night does not
   * have to be typed in live.
   *
   * All DJ-only and owned by the DJ rather than an event — a set built once is
   * meant to be used again. Mutations return the whole set because every screen
   * that changes one immediately redraws it.
   */
  listDjSets(): Promise<DjSet[]>
  getDjSet(setId: string): Promise<DjSet | null>
  createDjSet(name: string): Promise<DjSet>
  renameDjSet(setId: string, name: string): Promise<DjSet>
  deleteDjSet(setId: string): Promise<void>
  addSongToSet(setId: string, song: DjSetSongInput): Promise<DjSet>
  removeSongFromSet(setId: string, songId: string): Promise<DjSet>
  /**
   * Copy a whole set into an event's queue as the DJ's own songs. Returns how
   * many landed. Copies rather than links, so editing the set later cannot
   * rewrite a night already played.
   */
  loadSetIntoQueue(eventId: string, setId: string): Promise<number>
  /** DJ-only. */
  updateRequestStatus(
    requestId: string,
    status: RequestStatus,
  ): Promise<SongRequest>
  /** DJ-only. */
  deleteRequest(requestId: string): Promise<void>
  /**
   * DJ-only. Persists a new manual ordering of the queue.
   *
   * `mainCount` says how many of the leading ids belong to the main half; the
   * rest fall into sub. Sent together rather than as a second call so a reorder
   * stays one write — a queue caught between the two would show songs in one
   * half ordered by the other's numbering. Omit it to leave the halves alone.
   */
  reorderQueue(
    eventId: string,
    orderedRequestIds: string[],
    mainCount?: number,
  ): Promise<void>
  /** DJ-only. Moves one queued song between the halves. */
  setQueueGroup(requestId: string, group: QueueGroup): Promise<SongRequest>
  subscribeSongRequests(eventId: string, onChange: () => void): Unsubscribe

  // ---- Request voting ----------------------------------------------------
  /** Ids of the requests the current guest has voted for at this event. */
  getMyRequestVotes(eventId: string): Promise<string[]>
  voteRequest(requestId: string): Promise<void>
  /** Fails for the guest's own founding vote. */
  removeRequestVote(requestId: string): Promise<void>

  // ---- Voting rounds -----------------------------------------------------
  createVotingRound(input: CreateVotingRoundInput): Promise<VotingRound>
  getActiveVotingRound(eventId: string): Promise<VotingRound | null>
  /** Most recent round regardless of status, for showing the last winner. */
  getLatestVotingRound(eventId: string): Promise<VotingRound | null>
  getVotingRoundResults(roundId: string): Promise<VotingRoundResults>
  castRoundVote(roundId: string, optionId: string): Promise<void>
  /** DJ-only. */
  endVotingRound(roundId: string): Promise<VotingRound>
  /** DJ-only. */
  cancelVotingRound(roundId: string): Promise<VotingRound>
  /**
   * Marks an expired round ended and resolves its winner. Idempotent and safe
   * for any client to call — the authority is the server's clock, not the
   * caller's.
   */
  finalizeVotingRoundIfExpired(roundId: string): Promise<VotingRound | null>
  /** DJ-only. Adds the winning option to the queue as a request. */
  pushWinnerToQueue(roundId: string, optionId: string): Promise<SongRequest>
  subscribeVotingRounds(eventId: string, onChange: () => void): Unsubscribe
}

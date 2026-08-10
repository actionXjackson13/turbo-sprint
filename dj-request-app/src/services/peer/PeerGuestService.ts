import type {
  DjSet,
  EventGuest,
  EventRecord,
  Profile,
  RequestSort,
  RequestStatus,
  SongRequest,
  VotingRound,
  VotingRoundResults,
} from '../../types/domain'
import {
  ServiceError,
  type SetLoadResult,
  type CreateRequestInput,
  type CreateVotingRoundInput,
  type DataService,
  type EventSettingsPatch,
  type GuestIdentity,
  type ServiceErrorCode,
  type Unsubscribe,
} from '../types'
import { getOrCreateLocalGuestId } from '../../utils/guestId'
import { channels } from '../demo/demoStore'
import {
  createPeerTransport,
  hostIdForCode,
  PeerError,
  randomPeerId,
  type PeerTransport,
} from './signalling'
import { isPeerMessage, type PeerMessage } from './protocol'

/**
 * A guest's view of a party hosted on the DJ's phone.
 *
 * Every read and write is a round trip to the DJ. There is no local replica
 * and no optimistic state, which is the same bargain the Supabase client
 * makes with Postgres — and for the same reason: the rules that decide whether
 * a request is a duplicate or a guest may vote again live in exactly one
 * place, so there is nothing for a second copy to disagree with.
 *
 * Screens cannot tell which backend they are talking to. This class exists so
 * that stays true.
 */

/** How long a call waits before giving up on the DJ's phone. */
const CALL_TIMEOUT_MS = 10_000

/** How long the initial connection may take before it is called a failure. */
const CONNECT_TIMEOUT_MS = 15_000

/**
 * How long to keep trying to get back to the DJ before giving up on them.
 *
 * A party is a room full of phones moving around, going in pockets and losing
 * WiFi for a moment. Being ejected from the event on the first blip is worse
 * than waiting: the guest loses their place, their requests and their votes
 * over something that fixes itself in seconds. Long enough to cover a walk to
 * the bar, short enough that a DJ who has actually gone home is noticed.
 */
const RECONNECT_WINDOW_MS = 90_000
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000]

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export class PeerGuestService implements DataService {
  private link: PeerTransport | null = null
  private nextCallId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private readonly guestUserId = getOrCreateLocalGuestId()
  /** Set once the DJ is gone for good; every later call fails fast. */
  private dead: PeerError | null = null
  /** An in-flight reconnect, awaited by calls made during a blip. */
  private reconnecting: Promise<void> | null = null

  private readonly code: string
  private readonly onDisconnect?: (error: PeerError) => void

  constructor(code: string, onDisconnect?: (error: PeerError) => void) {
    this.code = code
    this.onDisconnect = onDisconnect
  }

  /** Dials the DJ and waits for the channel to open. */
  async connect(): Promise<void> {
    await this.openLink()
  }

  /**
   * Get back to the DJ after the channel drops, rather than ejecting the guest.
   *
   * The old behaviour was to hand the app back its local storage the instant
   * anything went wrong, which — since the party's event does not exist on the
   * guest's own device — threw them out of the event entirely. Almost every
   * drop is temporary, so this rebuilds the connection quietly and only gives
   * up once it is clear the DJ has gone.
   */
  private reconnect(cause: PeerError): void {
    if (this.dead || this.reconnecting) return

    const deadline = Date.now() + RECONNECT_WINDOW_MS

    // Never rejects: callers await it only to find out whether to carry on,
    // and `dead` is what carries the verdict.
    this.reconnecting = (async () => {
      for (let attempt = 0; Date.now() < deadline; attempt++) {
        const wait =
          RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!
        await new Promise((r) => setTimeout(r, wait))
        if (this.dead) return

        try {
          this.link?.close()
          await this.openLink()
          this.reconnecting = null
          /**
           * Wake every screen. Whatever changed at the party while this guest
           * was away, they are now looking at a stale copy of it — and the
           * subscription tick is the path each screen already uses to refresh.
           */
          for (const set of this.listeners.values()) {
            for (const listener of [...set]) listener()
          }
          return
        } catch {
          // Still unreachable; the loop decides whether there is time to retry.
        }
      }

      this.reconnecting = null
      this.fallOver(cause)
    })()
  }

  private openLink(): Promise<void> {
    const hostId = hostIdForCode(this.code)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (err?: PeerError) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      }

      /**
       * Reaching the relay proves nothing about reaching the DJ. The two
       * phones still have to find a route to each other, and on a network
       * that refuses direct connections they never will — with no error, just
       * silence. This is what turns that silence into an answer.
       */
      const timer = setTimeout(
        () =>
          finish(
            new PeerError(
              'unreachable',
              'Could not reach the DJ. Check the code, and make sure the DJ still has the app open on their phone.',
            ),
          ),
        CONNECT_TIMEOUT_MS,
      )

      const link = createPeerTransport(
        randomPeerId(),
        {
          onOpen: () => {
            link.send(hostId, {
              t: 'hello',
              guestUserId: this.guestUserId,
            } satisfies PeerMessage)
            finish()
          },
          onMessage: (_peerId, data) => this.onMessage(data),
          onClose: () => {
            const error = new PeerError('lost', 'Lost the connection to the DJ.')
            finish(error)
            this.reconnect(error)
          },
          onError: (error) => {
            finish(error)
            this.reconnect(error)
          },
        },
        false,
      )
      this.link = link

      link
        .connect()
        .then(() => link.dial(hostId))
        .catch((err: unknown) => {
          finish(
            err instanceof PeerError
              ? err
              : new PeerError('signal-failed', 'Could not join the party.'),
          )
        })
    })
  }

  disconnect(): void {
    // Marks this service finished, so an in-flight reconnect stops trying.
    this.dead ??= new PeerError('lost', 'You left the party.')
    this.link?.close()
    this.link = null
  }

  /** True while the connection is being rebuilt, for the UI to say so. */
  get isReconnecting(): boolean {
    return this.reconnecting !== null
  }

  // ---- Wire --------------------------------------------------------------

  private onMessage(data: unknown): void {
    if (!isPeerMessage(data)) return

    if (data.t === 'changed') {
      for (const channel of data.channels) {
        for (const listener of [...(this.listeners.get(channel) ?? [])]) {
          listener()
        }
      }
      return
    }

    if (data.t === 'result' || data.t === 'error') {
      const pending = this.pending.get(data.id)
      if (!pending) return
      this.pending.delete(data.id)
      clearTimeout(pending.timer)

      if (data.t === 'result') pending.resolve(data.value)
      else pending.reject(new ServiceError(data.kind as ServiceErrorCode, data.message))
    }
  }

  /** Everything the DJ is dropped once: later calls fail fast, not slowly. */
  private fallOver(error: PeerError): void {
    if (this.dead) return
    this.dead = error

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new ServiceError('network', error.message))
    }
    this.pending.clear()
    this.onDisconnect?.(error)
  }

  /** Throws if the DJ is gone for good. Re-read each time, never cached. */
  private throwIfGone(): void {
    const gone = this.dead
    if (gone) throw new ServiceError('network', gone.message)
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    this.throwIfGone()

    /**
     * Ride out a blip rather than reporting it.
     *
     * A screen that asks for something a second after the WiFi wobbled should
     * get an answer, not an error it will render as a broken party. Waiting
     * costs the guest a moment; failing costs them the screen.
     */
    if (this.reconnecting) {
      await this.reconnecting
      this.throwIfGone()
    }

    const link = this.link
    if (!link) {
      throw new ServiceError('network', 'Not connected to the party.')
    }

    const id = this.nextCallId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new ServiceError(
            'network',
            'The DJ’s phone did not answer. It may have gone to sleep.',
          ),
        )
      }, CALL_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })
      link.send(hostIdForCode(this.code), {
        t: 'call',
        id,
        method,
        args,
      } satisfies PeerMessage)
    })
  }

  /** Wakes local screens when the DJ says this channel changed. */
  private listen(channel: string, onChange: () => void): Unsubscribe {
    const set = this.listeners.get(channel) ?? new Set<() => void>()
    set.add(onChange)
    this.listeners.set(channel, set)
    return () => {
      set.delete(onChange)
      if (set.size === 0) this.listeners.delete(channel)
    }
  }

  /**
   * Anything only the DJ's own device can do. Never reaches the wire.
   *
   * Rejects rather than throwing: every one of these is declared as returning
   * a Promise, and a caller reaching for `.catch()` on what it was promised
   * should not instead get an exception thrown at it mid-expression.
   */
  private djOnly(): Promise<never> {
    return Promise.reject(
      new ServiceError(
        'forbidden',
        'Only the DJ can do that, and this is a guest device.',
      ),
    )
  }

  // ---- DJ authentication -------------------------------------------------

  signUpDj(): Promise<Profile> {
    return this.djOnly()
  }
  signInDj(): Promise<Profile> {
    return this.djOnly()
  }
  async signOutDj(): Promise<void> {
    // Nothing to sign out of, and callers should not have to care.
  }
  async getCurrentDjProfile(): Promise<Profile | null> {
    return null
  }
  onDjAuthStateChange(): Unsubscribe {
    return () => {}
  }

  // ---- Guest identity ----------------------------------------------------

  /**
   * The id is local and unverified — the DJ takes the guest's word for who
   * they are. That is the same trust level as the racing game at the root of
   * this repository, and it is the right one for a party: the worst available
   * mischief is voting twice from a browser you tampered with. Supabase mode
   * is where an identity is actually verified.
   */
  async getOrCreateGuestIdentity(): Promise<GuestIdentity> {
    return { guestUserId: this.guestUserId }
  }

  // ---- Events ------------------------------------------------------------

  createEvent(): Promise<EventRecord> {
    return this.djOnly()
  }
  async getDjEvents(): Promise<EventRecord[]> {
    return []
  }
  getEventById(eventId: string): Promise<EventRecord | null> {
    return this.call('getEventById', eventId)
  }
  getEventByCode(code: string): Promise<EventRecord | null> {
    return this.call('getEventByCode', code)
  }
  updateEventSettings(
    _eventId: string,
    _patch: EventSettingsPatch,
  ): Promise<EventRecord> {
    return this.djOnly()
  }
  setNowPlaying(): Promise<EventRecord> {
    return this.djOnly()
  }
  endEvent(): Promise<EventRecord> {
    return this.djOnly()
  }
  setAnnouncement(): Promise<EventRecord> {
    // Guests read the DJ's message off the event record; they never write one.
    return this.djOnly()
  }
  subscribeEvent(eventId: string, onChange: () => void): Unsubscribe {
    return this.listen(channels.event(eventId), onChange)
  }

  // ---- Guest membership --------------------------------------------------

  joinEvent(
    code: string,
    displayName: string,
  ): Promise<{ event: EventRecord; guest: EventGuest }> {
    return this.call('joinEvent', code, displayName)
  }
  getGuestSession(eventId: string): Promise<EventGuest | null> {
    return this.call('getGuestSession', eventId)
  }
  getEventGuestCount(eventId: string): Promise<number> {
    return this.call('getEventGuestCount', eventId)
  }
  async listEventGuests(eventId: string): Promise<EventGuest[]> {
    // Mirrors Supabase, where RLS lets a guest read only their own row.
    const self = await this.getGuestSession(eventId)
    return self ? [self] : []
  }
  setGuestBlocked(): Promise<void> {
    return this.djOnly()
  }

  // ---- Song requests -----------------------------------------------------

  listSongRequests(
    eventId: string,
    opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
  ): Promise<SongRequest[]> {
    return this.call('listSongRequests', eventId, opts)
  }
  getSongRequest(requestId: string): Promise<SongRequest | null> {
    return this.call('getSongRequest', requestId)
  }
  getMyRequests(eventId: string): Promise<SongRequest[]> {
    return this.call('getMyRequests', eventId)
  }
  findSimilarRequest(
    eventId: string,
    title: string,
    artist: string,
  ): Promise<SongRequest | null> {
    return this.call('findSimilarRequest', eventId, title, artist)
  }
  createSongRequest(input: CreateRequestInput): Promise<SongRequest> {
    return this.call('createSongRequest', input)
  }
  updateRequestStatus(): Promise<SongRequest> {
    return this.djOnly()
  }
  deleteRequest(): Promise<void> {
    return this.djOnly()
  }
  reorderQueue(): Promise<void> {
    return this.djOnly()
  }
  subscribeSongRequests(eventId: string, onChange: () => void): Unsubscribe {
    return this.listen(channels.requests(eventId), onChange)
  }

  // ---- Request voting ----------------------------------------------------

  getMyRequestVotes(eventId: string): Promise<string[]> {
    return this.call('getMyRequestVotes', eventId)
  }
  voteRequest(requestId: string): Promise<void> {
    return this.call('voteRequest', requestId)
  }
  removeRequestVote(requestId: string): Promise<void> {
    return this.call('removeRequestVote', requestId)
  }

  // ---- Voting rounds -----------------------------------------------------

  createVotingRound(_input: CreateVotingRoundInput): Promise<VotingRound> {
    return this.djOnly()
  }
  getActiveVotingRound(eventId: string): Promise<VotingRound | null> {
    return this.call('getActiveVotingRound', eventId)
  }
  getLatestVotingRound(eventId: string): Promise<VotingRound | null> {
    return this.call('getLatestVotingRound', eventId)
  }
  getVotingRoundResults(roundId: string): Promise<VotingRoundResults> {
    return this.call('getVotingRoundResults', roundId)
  }
  castRoundVote(roundId: string, optionId: string): Promise<void> {
    return this.call('castRoundVote', roundId, optionId)
  }
  endVotingRound(): Promise<VotingRound> {
    return this.djOnly()
  }
  cancelVotingRound(): Promise<VotingRound> {
    return this.djOnly()
  }
  finalizeVotingRoundIfExpired(roundId: string): Promise<VotingRound | null> {
    return this.call('finalizeVotingRoundIfExpired', roundId)
  }
  setQueueGroup(): Promise<SongRequest> {
    return this.djOnly()
  }
  addDjSong(): Promise<SongRequest> {
    return this.djOnly()
  }
  // A guest has no sets of their own and must never see the DJ's.
  listDjSets(): Promise<DjSet[]> {
    return this.djOnly()
  }
  getDjSet(): Promise<DjSet | null> {
    return this.djOnly()
  }
  createDjSet(): Promise<DjSet> {
    return this.djOnly()
  }
  renameDjSet(): Promise<DjSet> {
    return this.djOnly()
  }
  deleteDjSet(): Promise<void> {
    return this.djOnly()
  }
  addSongToSet(): Promise<DjSet> {
    return this.djOnly()
  }
  removeSongFromSet(): Promise<DjSet> {
    return this.djOnly()
  }
  reorderSetSongs(): Promise<DjSet> {
    return this.djOnly()
  }
  duplicateDjSet(): Promise<DjSet> {
    return this.djOnly()
  }
  loadSetIntoQueue(): Promise<SetLoadResult> {
    return this.djOnly()
  }
  pushWinnerToQueue(): Promise<SongRequest> {
    return this.djOnly()
  }
  subscribeVotingRounds(eventId: string, onChange: () => void): Unsubscribe {
    return this.listen(channels.rounds(eventId), onChange)
  }
}

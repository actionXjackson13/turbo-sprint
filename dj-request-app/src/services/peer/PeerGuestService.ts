import type {
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
  private disconnected: PeerError | null = null

  private readonly code: string
  private readonly onDisconnect?: (error: PeerError) => void

  constructor(code: string, onDisconnect?: (error: PeerError) => void) {
    this.code = code
    this.onDisconnect = onDisconnect
  }

  /** Dials the DJ and waits for the channel to open. */
  async connect(): Promise<void> {
    const hostId = hostIdForCode(this.code)

    await new Promise<void>((resolve, reject) => {
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
              'Could not reach the DJ. Make sure you are on the same WiFi, and that the DJ still has the app open.',
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
            this.fallOver(error)
          },
          onError: (error) => {
            finish(error)
            this.fallOver(error)
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
    this.link?.close()
    this.link = null
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
    if (this.disconnected) return
    this.disconnected = error

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new ServiceError('network', error.message))
    }
    this.pending.clear()
    this.onDisconnect?.(error)
  }

  private call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (this.disconnected) {
      return Promise.reject(
        new ServiceError('network', this.disconnected.message),
      )
    }
    const link = this.link
    if (!link) {
      return Promise.reject(
        new ServiceError('network', 'Not connected to the party.'),
      )
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
  pushWinnerToQueue(): Promise<SongRequest> {
    return this.djOnly()
  }
  subscribeVotingRounds(eventId: string, onChange: () => void): Unsubscribe {
    return this.listen(channels.rounds(eventId), onChange)
  }
}

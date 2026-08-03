import { channels, subscribe, setActiveGuestUserId, getActiveGuestUserId } from '../demo/demoStore'
import { ServiceError } from '../types'
import type { DataService } from '../types'
import {
  createPeerTransport,
  hostIdForCode,
  PeerError,
  type PeerTransport,
} from './signalling'
import { isPeerMessage, type CallMessage, type PeerMessage } from './protocol'

/**
 * The DJ's phone, acting as the party's server.
 *
 * Every guest call runs here, against the same local store the DJ's own
 * screens read, through the same DataService implementation that demo mode
 * uses. That is the point: duplicate detection, the per-guest request cap,
 * one-vote-each and queue ordering are already written and tested once, and
 * hosting reuses them rather than reimplementing them for the wire.
 *
 * The trade-off is inherent to having no server: the party exists only while
 * the DJ has the app open. Close it and the guests are disconnected — which
 * is roughly true of a DJ leaving anyway.
 */

/**
 * What a guest is allowed to ask for.
 *
 * This is the security boundary, and it is the whole of it. The DJ is signed
 * in on this device, so DemoService's ownership checks — which ask whether the
 * *local* user owns the event — pass for anything that reaches them, including
 * a message a guest crafted by hand. Nothing keeps a guest out of
 * `endEvent` or `setGuestBlocked` except its absence from this list.
 *
 * It mirrors what Supabase's RLS policies grant an anonymous guest, so the two
 * backends agree on who may do what.
 */
const GUEST_METHODS: ReadonlySet<string> = new Set<keyof DataService & string>([
  'getEventById',
  'getEventByCode',
  'joinEvent',
  'getGuestSession',
  'getEventGuestCount',
  'listSongRequests',
  'getSongRequest',
  'getMyRequests',
  'findSimilarRequest',
  'createSongRequest',
  'getMyRequestVotes',
  'voteRequest',
  'removeRequestVote',
  'getActiveVotingRound',
  'getLatestVotingRound',
  'getVotingRoundResults',
  'castRoundVote',
  'finalizeVotingRoundIfExpired',
])

export interface PeerHostEvents {
  /** The number of connected guests changed. */
  onGuestCountChange?: (count: number) => void
  onError?: (error: PeerError) => void
}

export class PeerHost {
  private link: PeerTransport | null = null
  private readonly guestIds = new Map<string, string>()
  private unsubscribes: Array<() => void> = []

  /**
   * Serialises guest calls.
   *
   * Which guest a call is "from" is module state in the demo store, set just
   * before dispatch and restored after — so two calls in flight at once would
   * let the second one's identity leak into the first. A party's traffic is a
   * few messages a minute, so a queue costs nothing and removes the class of
   * bug entirely.
   */
  private queue: Promise<void> = Promise.resolve()

  private readonly service: DataService
  private readonly eventId: string
  private readonly events: PeerHostEvents

  constructor(
    service: DataService,
    eventId: string,
    events: PeerHostEvents = {},
  ) {
    this.service = service
    this.eventId = eventId
    this.events = events
  }

  /** Registers the event's code on the relay and starts accepting guests. */
  async start(code: string): Promise<void> {
    const link = createPeerTransport(
      hostIdForCode(code),
      {
        onMessage: (peerId, data) => this.onMessage(peerId, data),
        onOpen: () => this.events.onGuestCountChange?.(this.guestCount),
        onClose: (peerId) => {
          this.guestIds.delete(peerId)
          this.events.onGuestCountChange?.(this.guestCount)
        },
        onError: (error) => this.events.onError?.(error),
      },
      true,
    )

    await link.connect()
    this.link = link

    /**
     * Tell guests to re-read whenever the store changes, whoever changed it.
     * Hooking the store rather than the call sites means a DJ action taken on
     * this phone propagates by exactly the same path as a guest's own — and no
     * future write can forget to announce itself.
     */
    this.unsubscribes = [
      subscribe(channels.requests(this.eventId), () =>
        this.announce(channels.requests(this.eventId)),
      ),
      subscribe(channels.rounds(this.eventId), () =>
        this.announce(channels.rounds(this.eventId)),
      ),
      subscribe(channels.event(this.eventId), () =>
        this.announce(channels.event(this.eventId)),
      ),
    ]
  }

  get guestCount(): number {
    return this.guestIds.size
  }

  stop(): void {
    for (const off of this.unsubscribes) off()
    this.unsubscribes = []
    this.guestIds.clear()
    this.link?.close()
    this.link = null
  }

  private announce(channel: string): void {
    this.link?.broadcast({ t: 'changed', channels: [channel] } satisfies PeerMessage)
  }

  private onMessage(peerId: string, data: unknown): void {
    if (!isPeerMessage(data)) return

    if (data.t === 'hello') {
      if (typeof data.guestUserId !== 'string' || !data.guestUserId) return
      this.guestIds.set(peerId, data.guestUserId)
      this.events.onGuestCountChange?.(this.guestCount)
      return
    }

    if (data.t === 'call') {
      // Chain rather than await: onMessage is a channel callback and cannot be
      // async without letting the next message overtake this one.
      this.queue = this.queue.then(() => this.dispatch(peerId, data))
    }
  }

  private async dispatch(peerId: string, call: CallMessage): Promise<void> {
    const link = this.link
    if (!link) return

    const guestUserId = this.guestIds.get(peerId)
    if (!guestUserId) {
      this.fail(peerId, call.id, 'forbidden', 'Rejoin the party and try again.')
      return
    }

    if (!GUEST_METHODS.has(call.method)) {
      this.fail(peerId, call.id, 'forbidden', 'Only the DJ can do that.')
      return
    }

    const previous = getActiveGuestUserId()
    try {
      setActiveGuestUserId(guestUserId)
      const fn = this.service[call.method as keyof DataService] as (
        ...args: unknown[]
      ) => Promise<unknown>
      const value = await fn.apply(this.service, call.args ?? [])
      link.send(peerId, { t: 'result', id: call.id, ok: true, value })
    } catch (err) {
      const kind = err instanceof ServiceError ? err.code : 'unknown'
      const message =
        err instanceof Error ? err.message : 'Something went wrong.'
      this.fail(peerId, call.id, kind, message)
    } finally {
      setActiveGuestUserId(previous)
    }
  }

  private fail(
    peerId: string,
    id: number,
    kind: string,
    message: string,
  ): void {
    this.link?.send(peerId, { t: 'error', id, ok: false, kind, message })
  }
}

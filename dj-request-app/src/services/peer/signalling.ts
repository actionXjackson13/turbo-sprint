/**
 * Peer-to-peer transport. No backend, no account, no bill.
 *
 * The app is static files on GitHub Pages, so there is nowhere to run a server
 * — but two browsers can talk to each other directly over a WebRTC data
 * channel once they have exchanged connection details. Only that exchange
 * needs a third party, and the public PeerJS cloud does it for free: it
 * forwards a JSON message from one registered id to another and never sees a
 * byte of what flows afterwards.
 *
 * This talks to the relay over a plain WebSocket rather than pulling in the
 * PeerJS client library, which does far more than the handshake we need. The
 * same approach already runs the multiplayer in the racing game at the root of
 * this repository; this is that transport, generalised and typed.
 *
 * Topology is a star with the DJ at the centre — see PeerHost. That is not a
 * compromise here the way it is in a game: the DJ genuinely is the authority
 * over their own queue, so the shape of the network matches the shape of the
 * problem.
 */

/** PeerJS's free relay. Only ever sees the handshake. */
const SIGNAL_HOST = 'wss://0.peerjs.com/peerjs?key=peerjs&version=1.5.4'

/**
 * STUN lets each side discover the address the other can actually reach it on.
 * There is deliberately no TURN server: relaying media costs money, and a
 * party is one room on one WiFi, which is the case direct connections handle
 * well. See `PeerJoinError` for what happens when they cannot.
 */
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
}

/** Namespaces our ids on a relay the whole internet shares. */
const ID_PREFIX = 'soundboard-'

/** Keeps the relay from dropping an idle socket. */
const HEARTBEAT_MS = 20_000

/**
 * How long to wait for the relay to acknowledge the registration.
 *
 * A socket that is being dropped silently — a captive portal, a firewall that
 * blackholes rather than refuses — never fires `error` or `close`, so without
 * this the promise simply never settles and the caller waits forever.
 */
const OPEN_TIMEOUT_MS = 12_000

export function hostIdForCode(code: string): string {
  return ID_PREFIX + code.toUpperCase()
}

export function randomPeerId(): string {
  return `${ID_PREFIX}g-${Math.random().toString(36).slice(2, 10)}`
}

export type PeerErrorKind =
  /** Another session already holds this id — for a host, a code collision. */
  | 'id-taken'
  /** The relay could not be reached at all. */
  | 'signal-failed'
  /** The relay had nobody registered under that id. Usually a wrong code. */
  | 'no-such-host'
  /** Reached the relay, but the direct connection never came up. */
  | 'unreachable'
  /** The connection was established and then lost. */
  | 'lost'

export class PeerError extends Error {
  readonly kind: PeerErrorKind

  constructor(kind: PeerErrorKind, message: string) {
    super(message)
    this.name = 'PeerError'
    this.kind = kind
  }
}

interface SignalMessage {
  type: string
  src?: string
  dst?: string
  payload?: {
    sdp?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
    connectionId?: string
  }
}

/**
 * The part of a link its callers actually use.
 *
 * PeerHost and PeerGuestService are written against this rather than the class
 * so a test can stand the two of them up facing each other in one process.
 * What that leaves untested is the handshake — which is the same handshake the
 * racing game at the root of this repository has been running on — while
 * covering everything built on top of it here, which is all new.
 */
export interface PeerTransport {
  connect(): Promise<void>
  dial(remoteId: string): Promise<void>
  send(peerId: string, data: unknown): void
  broadcast(data: unknown): void
  close(): void
}

export type PeerTransportFactory = (
  id: string,
  events: PeerLinkEvents,
  acceptsOffers: boolean,
) => PeerTransport

let factory: PeerTransportFactory = (id, events, acceptsOffers) =>
  new PeerLink(id, events, acceptsOffers)

export function createPeerTransport(
  id: string,
  events: PeerLinkEvents,
  acceptsOffers: boolean,
): PeerTransport {
  return factory(id, events, acceptsOffers)
}

/** Test hook. Pass null to restore real WebRTC. */
export function __setPeerTransportFactory(
  next: PeerTransportFactory | null,
): void {
  factory =
    next ?? ((id, events, acceptsOffers) => new PeerLink(id, events, acceptsOffers))
}

export interface PeerLinkEvents {
  /** A data channel to `peerId` is open and usable. */
  onOpen?: (peerId: string) => void
  /** A decoded JSON message arrived from `peerId`. */
  onMessage?: (peerId: string, data: unknown) => void
  /** The link to `peerId` is gone. */
  onClose?: (peerId: string) => void
  /** Something went wrong that the caller should surface. */
  onError?: (error: PeerError) => void
}

interface Peer {
  pc: RTCPeerConnection
  channel: RTCDataChannel | null
}

/**
 * One registration on the relay plus every direct connection hanging off it.
 *
 * A host makes one of these and waits; a guest makes one and dials. Neither
 * knows anything about songs — that lives a layer up.
 */
export class PeerLink {
  private ws: WebSocket | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private readonly peers = new Map<string, Peer>()

  /**
   * ICE candidates that arrived before the description they belong to.
   *
   * The relay does not order the two against each other, and adding a
   * candidate to a connection with no remote description throws — so they wait
   * here until there is somewhere to put them.
   */
  private readonly pendingIce = new Map<string, RTCIceCandidateInit[]>()

  /**
   * The connection id each peer agreed on. PeerJS scopes a handshake to one of
   * these, and answering on a different id is silently ignored.
   */
  private readonly connectionIds = new Map<string, string>()

  private closed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0

  readonly id: string
  private readonly events: PeerLinkEvents
  /** Hosts answer offers; guests ignore them. */
  private readonly acceptsOffers: boolean

  constructor(id: string, events: PeerLinkEvents, acceptsOffers: boolean) {
    this.id = id
    this.events = events
    this.acceptsOffers = acceptsOffers
  }

  /** Registers `id` with the relay. Rejects if it is taken or unreachable. */
  connect(): Promise<void> {
    return this.openSocket()
  }

  /**
   * Re-register after the relay drops us.
   *
   * Existing guests are unaffected — they are on direct channels — but a host
   * with no socket is invisible to anyone who has not joined yet, and their
   * code silently stops working halfway through the night. Backs off so a
   * relay that is genuinely down is not hammered.
   */
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return

    const delay = Math.min(2_000 * 2 ** this.reconnectAttempts, 30_000)
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.closed) return
      this.openSocket()
        .then(() => {
          this.reconnectAttempts = 0
        })
        .catch(() => this.scheduleReconnect())
    }, delay)
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = Math.random().toString(36).slice(2)
      const url = `${SIGNAL_HOST}&id=${encodeURIComponent(this.id)}&token=${token}`
      let settled = false
      const ws = new WebSocket(url)

      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        ws.close()
        reject(
          new PeerError(
            'signal-failed',
            'Could not reach the connection service. Check your internet.',
          ),
        )
      }, OPEN_TIMEOUT_MS)

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        fn()
      }

      ws.onmessage = (ev: MessageEvent<string>) => {
        let msg: SignalMessage
        try {
          msg = JSON.parse(ev.data) as SignalMessage
        } catch {
          return
        }

        if (msg.type === 'OPEN') {
          settle(() => {
            this.ws = ws
            if (this.heartbeat) clearInterval(this.heartbeat)
            this.heartbeat = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'HEARTBEAT' }))
              }
            }, HEARTBEAT_MS)
            resolve()
          })
          return
        }

        if (msg.type === 'ID-TAKEN') {
          settle(() => {
            ws.close()
            reject(new PeerError('id-taken', 'That code is already in use.'))
          })
          return
        }

        this.onSignal(msg)
      }

      ws.onerror = () => {
        settle(() =>
          reject(
            new PeerError(
              'signal-failed',
              'Could not reach the connection service. Check your internet.',
            ),
          ),
        )
      }

      ws.onclose = () => {
        if (!settled) {
          settle(() =>
            reject(
              new PeerError(
                'signal-failed',
                'Could not reach the connection service. Check your internet.',
              ),
            ),
          )
          return
        }
        /**
         * The relay is a matchmaker, not a lifeline. Once a data channel is
         * open the two phones are talking to each other directly and the
         * signalling socket has no further part in it — PeerJS's free service
         * drops idle sockets on its own schedule, and reporting that as
         * "lost the party" was ending sessions that were working perfectly.
         *
         * It only matters while nobody is connected yet, when it is the one
         * thing a guest is waiting on.
         */
        if (this.closed) return

        if (this.peers.size === 0) {
          this.events.onError?.(
            new PeerError('lost', 'Lost the connection to the party.'),
          )
        }
        this.scheduleReconnect()
      }
    })
  }

  /** Dials another registered id and opens a data channel to it. */
  async dial(remoteId: string): Promise<void> {
    const pc = this.newPeerConnection(remoteId)
    const channel = pc.createDataChannel('soundboard', { ordered: true })
    this.peers.set(remoteId, { pc, channel })
    this.wireChannel(remoteId, channel)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.signalSend('OFFER', remoteId, { sdp: pc.localDescription! })
  }

  send(peerId: string, data: unknown): void {
    const peer = this.peers.get(peerId)
    if (peer?.channel?.readyState === 'open') {
      peer.channel.send(JSON.stringify(data))
    }
  }

  broadcast(data: unknown): void {
    const raw = JSON.stringify(data)
    for (const peer of this.peers.values()) {
      if (peer.channel?.readyState === 'open') peer.channel.send(raw)
    }
  }

  get peerIds(): string[] {
    return [...this.peers.keys()]
  }

  close(): void {
    this.closed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    for (const id of [...this.peers.keys()]) this.drop(id)
    this.ws?.close()
    this.ws = null
  }

  // ---- Signalling --------------------------------------------------------

  /**
   * The relay inspects what it forwards and hangs up on anything that does not
   * look like its own client — a bare `{sdp}` gets the socket closed with no
   * explanation. Only `sdp`, `candidate` and `connectionId` matter to us; the
   * rest of this object is there to get past the door.
   */
  private signalSend(
    type: 'OFFER' | 'ANSWER' | 'CANDIDATE',
    dst: string,
    payload: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit },
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const connectionId = this.connectionIds.get(dst) ?? this.newConnectionId(dst)
    this.ws.send(
      JSON.stringify({
        type,
        dst,
        payload: {
          type: 'data',
          connectionId,
          label: connectionId,
          reliable: true,
          serialization: 'json',
          metadata: null,
          browser: 'Chrome',
          ...payload,
        },
      }),
    )
  }

  private newConnectionId(dst: string): string {
    const id = `dc_${Math.random().toString(36).slice(2, 11)}`
    this.connectionIds.set(dst, id)
    return id
  }

  private onSignal(msg: SignalMessage): void {
    const src = msg.src
    if (!src) return

    switch (msg.type) {
      case 'OFFER': {
        if (!this.acceptsOffers) return
        // Answer on the id the caller opened with, or it is ignored.
        if (msg.payload?.connectionId) {
          this.connectionIds.set(src, msg.payload.connectionId)
        }
        if (msg.payload?.sdp) void this.acceptOffer(src, msg.payload.sdp)
        return
      }
      case 'ANSWER': {
        const peer = this.peers.get(src)
        if (!peer || !msg.payload?.sdp) return
        peer.pc
          .setRemoteDescription(msg.payload.sdp)
          .then(() => this.flushIce(src))
          .catch(() => this.drop(src))
        return
      }
      case 'CANDIDATE': {
        const candidate = msg.payload?.candidate
        if (!candidate) return
        const peer = this.peers.get(src)
        if (!peer?.pc.remoteDescription) {
          const queued = this.pendingIce.get(src) ?? []
          queued.push(candidate)
          this.pendingIce.set(src, queued)
          return
        }
        void peer.pc.addIceCandidate(candidate).catch(() => {})
        return
      }
      case 'EXPIRE': {
        // The relay had nobody under that id to deliver to.
        this.events.onError?.(
          new PeerError(
            'no-such-host',
            'No party found with that code. Check it with the DJ.',
          ),
        )
        return
      }
      case 'LEAVE': {
        this.drop(src)
        return
      }
    }
  }

  private async acceptOffer(
    remoteId: string,
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> {
    const pc = this.newPeerConnection(remoteId)
    pc.ondatachannel = (e) => this.wireChannel(remoteId, e.channel)
    this.peers.set(remoteId, { pc, channel: null })

    try {
      await pc.setRemoteDescription(sdp)
      this.flushIce(remoteId)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.signalSend('ANSWER', remoteId, { sdp: pc.localDescription! })
    } catch {
      this.drop(remoteId)
    }
  }

  private flushIce(remoteId: string): void {
    const peer = this.peers.get(remoteId)
    const queued = this.pendingIce.get(remoteId)
    if (!peer || !queued) return
    for (const candidate of queued) {
      void peer.pc.addIceCandidate(candidate).catch(() => {})
    }
    this.pendingIce.delete(remoteId)
  }

  private newPeerConnection(remoteId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE)
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signalSend('CANDIDATE', remoteId, { candidate: e.candidate })
      }
    }
    pc.onconnectionstatechange = () => {
      /**
       * `disconnected` is not a verdict — it means packets stopped arriving,
       * which a phone does every time it changes WiFi channel, drifts to the
       * far side of a room, or has its screen turned off for a moment. WebRTC
       * recovers from it on its own and returns to `connected`. Treating it as
       * terminal is why a guest was being dropped out of a working party a
       * minute or two in: nothing was actually broken.
       *
       * `failed` is the verdict. That one is terminal, and ICE only declares
       * it after its own retries have been exhausted.
       */
      if (['failed', 'closed'].includes(pc.connectionState)) {
        this.drop(remoteId)
      }
    }
    return pc
  }

  private wireChannel(remoteId: string, channel: RTCDataChannel): void {
    const peer = this.peers.get(remoteId) ?? {
      pc: this.newPeerConnection(remoteId),
      channel: null,
    }
    peer.channel = channel
    this.peers.set(remoteId, peer)

    channel.onopen = () => this.events.onOpen?.(remoteId)
    channel.onmessage = (e: MessageEvent<string>) => {
      try {
        this.events.onMessage?.(remoteId, JSON.parse(e.data))
      } catch {
        // Not ours, or truncated. Nothing useful to do with it.
      }
    }
    channel.onclose = () => this.drop(remoteId)
  }

  private drop(remoteId: string): void {
    const peer = this.peers.get(remoteId)
    if (!peer) return
    this.peers.delete(remoteId)
    this.pendingIce.delete(remoteId)
    this.connectionIds.delete(remoteId)
    try {
      peer.channel?.close()
      peer.pc.close()
    } catch {
      // Already torn down.
    }
    this.events.onClose?.(remoteId)
  }
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb, getActiveGuestUserId } from '../../src/services/demo/demoStore'
import { PeerHost } from '../../src/services/peer/PeerHost'
import { PeerGuestService } from '../../src/services/peer/PeerGuestService'
import {
  __setPeerTransportFactory,
  type PeerLinkEvents,
  type PeerTransport,
} from '../../src/services/peer/signalling'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import {
  __resetPartySession,
  isRemoteCode,
  startHosting,
} from '../../src/services/partySession'

/**
 * The party without the plumbing.
 *
 * A DJ's phone hosting for a guest's phone, wired to each other in one
 * process: real PeerHost, real PeerGuestService, real DemoService underneath,
 * with only the WebRTC handshake swapped for a pair of queues. That covers
 * everything written for this app — who may call what, whose identity a call
 * runs as, and whether a change reaches the other side — and leaves out only
 * the transport, which is a port of the one already running the racing game in
 * this repository.
 */

/** Every link created during a test, so the two sides can find each other. */
const links = new Map<string, LoopbackLink>()

class LoopbackLink implements PeerTransport {
  readonly id: string
  readonly events: PeerLinkEvents
  private open = true

  constructor(id: string, events: PeerLinkEvents) {
    this.id = id
    this.events = events
    links.set(id, this)
  }

  async connect(): Promise<void> {}

  async dial(remoteId: string): Promise<void> {
    const host = links.get(remoteId)
    if (!host) throw new Error(`no host at ${remoteId}`)
    // Both ends learn about each other, then the dialler's channel opens —
    // the same order the real link reports.
    host.events.onOpen?.(this.id)
    this.events.onOpen?.(remoteId)
  }

  send(peerId: string, data: unknown): void {
    if (!this.open) return
    const target = links.get(peerId)
    if (!target) return
    // Asynchronous, like a real channel: a reply must never arrive inside the
    // call that sent the request.
    queueMicrotask(() =>
      target.events.onMessage?.(this.id, JSON.parse(JSON.stringify(data))),
    )
  }

  broadcast(data: unknown): void {
    for (const [id, link] of links) {
      if (id === this.id) continue
      // Only guests hold a link to the host, so this reaches exactly them.
      queueMicrotask(() =>
        link.events.onMessage?.(this.id, JSON.parse(JSON.stringify(data))),
      )
    }
  }

  close(): void {
    this.open = false
    links.delete(this.id)
  }
}

/** Lets queued microtasks and the demo backend's simulated latency settle. */
const settle = () => new Promise((r) => setTimeout(r, 60))

describe('a party hosted on the DJ’s phone', () => {
  let dj: DemoService
  let host: PeerHost
  let guest: PeerGuestService
  let eventId: string

  beforeEach(async () => {
    links.clear()
    resetDemoDb()
    __setPeerTransportFactory((id, events) => new LoopbackLink(id, events))

    dj = new DemoService()
    // The host device is a signed-in DJ; that is what makes its own writes
    // pass the ownership checks a guest's must not.
    await dj.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    const event = await dj.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id

    host = new PeerHost(dj, eventId)
    await host.start(DEMO_EVENT_CODE)

    guest = new PeerGuestService(DEMO_EVENT_CODE)
    await guest.connect()
    await settle()
  })

  afterEach(() => {
    guest.disconnect()
    host.stop()
    __setPeerTransportFactory(null)
    links.clear()
  })

  it('lets a guest read the DJ’s event across the wire', async () => {
    const event = await guest.getEventById(eventId)
    expect(event?.name).toBe('Summer Rooftop Party')
  })

  it('delivers a guest’s request to the DJ', async () => {
    const { guest: membership } = await guest.joinEvent(
      DEMO_EVENT_CODE,
      'Sam on the sofa',
    )
    expect(membership.displayName).toBe('Sam on the sofa')

    await guest.createSongRequest({
      eventId,
      title: 'Common People',
      artist: 'Pulp',
    })

    // The DJ reads their own store directly — the request has to be *there*,
    // not merely acknowledged over the wire.
    const onDjPhone = await dj.listSongRequests(eventId)
    expect(onDjPhone.map((r) => r.title)).toContain('Common People')
  })

  it('attributes the request to the guest who sent it, not the DJ', async () => {
    await guest.joinEvent(DEMO_EVENT_CODE, 'Sam on the sofa')
    await guest.createSongRequest({
      eventId,
      title: 'Common People',
      artist: 'Pulp',
    })

    const mine = await guest.getMyRequests(eventId)
    expect(mine.map((r) => r.title)).toContain('Common People')

    const sent = (await dj.listSongRequests(eventId)).find(
      (r) => r.title === 'Common People',
    )
    expect(sent?.guestDisplayName).toBe('Sam on the sofa')
  })

  it('restores the DJ’s own identity after serving a guest', async () => {
    const before = getActiveGuestUserId()
    await guest.joinEvent(DEMO_EVENT_CODE, 'Sam on the sofa')
    await guest.getMyRequests(eventId)
    expect(getActiveGuestUserId()).toBe(before)
  })

  it('wakes the guest when the DJ changes something', async () => {
    await guest.joinEvent(DEMO_EVENT_CODE, 'Sam on the sofa')

    let woken = 0
    const stop = guest.subscribeSongRequests(eventId, () => {
      woken += 1
    })

    const pending = (await dj.listSongRequests(eventId)).find(
      (r) => r.status === 'pending',
    )
    await dj.updateRequestStatus(pending!.id, 'queued')
    await settle()

    stop()
    expect(woken).toBeGreaterThan(0)
  })

  /**
   * The allowlist is the only thing standing between a guest and the DJ's
   * controls. The DJ is signed in on the hosting device, so a forged message
   * that got past it would sail through every ownership check underneath.
   */
  it('refuses a DJ-only call that a guest sends by hand', async () => {
    await guest.joinEvent(DEMO_EVENT_CODE, 'Sam on the sofa')
    const queued = (await dj.listSongRequests(eventId)).find(
      (r) => r.status === 'queued',
    )

    const forge = guest as unknown as {
      call: (method: string, ...args: unknown[]) => Promise<unknown>
    }
    await expect(
      forge.call('updateRequestStatus', queued!.id, 'declined'),
    ).rejects.toThrow(/only the dj/i)

    // And the DJ's data is untouched.
    const after = await dj.getSongRequest(queued!.id)
    expect(after?.status).toBe('queued')
  })

  it('does not even send DJ-only calls the guest UI could reach', async () => {
    await expect(guest.endEvent()).rejects.toBeInstanceOf(ServiceError)
    await expect(guest.createEvent()).rejects.toBeInstanceOf(ServiceError)
  })

  it('reports the DJ’s refusal in the DJ’s own words', async () => {
    await guest.joinEvent(DEMO_EVENT_CODE, 'Sam on the sofa')
    await dj.updateEventSettings(eventId, { requestStatus: 'closed' })

    await expect(
      guest.createSongRequest({ eventId, title: 'Anything', artist: 'Anyone' }),
    ).rejects.toThrow(/closed/i)
  })

  it('counts a connected guest for the DJ', () => {
    expect(host.guestCount).toBe(1)
  })
})

/**
 * The sample event ships in every copy of this app under the same code, so it
 * is the one event that must never be announced on a shared relay: the first
 * person to open the demo would take the id and everyone after would collide
 * with them, over a party none of them could join anyway.
 */
describe('the sample event is never hosted', () => {
  let built: string[]

  beforeEach(() => {
    links.clear()
    __resetPartySession()
    built = []
    __setPeerTransportFactory((id, events) => {
      built.push(id)
      return new LoopbackLink(id, events)
    })
  })

  afterEach(() => {
    __setPeerTransportFactory(null)
    __resetPartySession()
    links.clear()
  })

  it('opens no connection for the seeded code', async () => {
    await startHosting('demo-event-0001', DEMO_EVENT_CODE)
    expect(built).toEqual([])
  })

  it('does host an event the DJ created', async () => {
    await startHosting('demo-event-abc', 'PRGU')
    expect(built).toEqual(['soundboard-PRGU'])
  })

  it('treats only the seeded code as local', () => {
    expect(isRemoteCode(DEMO_EVENT_CODE)).toBe(false)
    expect(isRemoteCode(DEMO_EVENT_CODE.toLowerCase())).toBe(false)
    expect(isRemoteCode('PRGU')).toBe(true)
  })
})

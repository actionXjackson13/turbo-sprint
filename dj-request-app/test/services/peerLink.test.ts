import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PeerLink, type PeerError } from '../../src/services/peer/signalling'

/**
 * What the link does with a registration that never came up.
 *
 * This is the transport layer rather than the party, and only one thing about
 * it is worth testing here — but it is the thing that broke parties in the
 * field. The relay holds a code until the socket that claimed it is reaped, so
 * a DJ reopening the app routinely collides with their own previous session.
 * The failed attempt used to leave its socket behind, quietly reconnecting;
 * when that reconnect succeeded it claimed the host's code on a link whose
 * owner had already given up, so guests got a data channel that answered
 * nothing while the DJ was told the party was not open.
 */

interface FakeMessage {
  type: string
  [key: string]: unknown
}

class FakeSocket {
  static readonly OPEN = 1
  static instances: FakeSocket[] = []

  readyState = FakeSocket.OPEN
  readonly url: string
  closed = false

  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  send(): void {}

  close(): void {
    if (this.closed) return
    this.closed = true
    this.onclose?.({})
  }

  /** Pretend the relay said something. */
  deliver(message: FakeMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1]!

describe('a registration that fails', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('leaves nothing behind that could claim the code later', async () => {
    const errors: PeerError[] = []
    const link = new PeerLink('soundboard-AAAA', {
      onError: (e) => errors.push(e),
    }, true)

    const attempt = link.connect()
    latest().deliver({ type: 'ID-TAKEN' })
    await expect(attempt).rejects.toMatchObject({ kind: 'id-taken' })

    expect(FakeSocket.instances).toHaveLength(1)

    // The bug: a reconnect fired a couple of seconds later and re-registered
    // the very id the caller had already given up on.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeSocket.instances).toHaveLength(1)

    // And it announced a lost party that had never started.
    expect(errors).toEqual([])
  })

  it('does the same when the relay cannot be reached at all', async () => {
    const link = new PeerLink('soundboard-AAAA', {}, true)

    const attempt = link.connect()
    latest().onerror?.({})
    await expect(attempt).rejects.toMatchObject({ kind: 'signal-failed' })

    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('does the same when the socket is silently blackholed', async () => {
    const link = new PeerLink('soundboard-AAAA', {}, true)

    // The expectation is attached before the clock moves: this rejection comes
    // from a timer, and attaching afterwards would let Node see it unhandled
    // in between.
    const attempt = expect(link.connect()).rejects.toMatchObject({
      kind: 'signal-failed',
    })
    // Nothing ever arrives — no OPEN, no error, no close.
    await vi.advanceTimersByTimeAsync(13_000)
    await attempt

    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })
})

/**
 * The other half of the same behaviour: a link that *did* come up must still
 * get itself back, or a host whose socket the relay drops mid-party goes
 * quietly unreachable to anyone who has not joined yet.
 */
describe('a registration that succeeded', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('re-registers after the relay drops the socket', async () => {
    const link = new PeerLink('soundboard-AAAA', {}, true)

    const attempt = link.connect()
    latest().deliver({ type: 'OPEN' })
    await attempt
    expect(FakeSocket.instances).toHaveLength(1)

    latest().close()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeSocket.instances.length).toBeGreaterThan(1)

    link.close()
  })

  it('stops re-registering once it is closed for good', async () => {
    const link = new PeerLink('soundboard-AAAA', {}, true)

    const attempt = link.connect()
    latest().deliver({ type: 'OPEN' })
    await attempt

    link.close()
    const settled = FakeSocket.instances.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeSocket.instances).toHaveLength(settled)
  })
})

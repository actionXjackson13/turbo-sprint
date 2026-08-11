import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseService } from '../../src/services/supabase/SupabaseService'

/**
 * One realtime channel per topic, however many screens are watching.
 *
 * A DJ looking at the control panel has three separate things following this
 * event's requests: the panel itself, the player deciding what to play next,
 * and the auto-accept sweep. Each opened its own channel on the same topic —
 * and a socket can only join a topic once, so the first worked and the rest
 * were quietly refused. Nothing threw; the queue simply stopped updating for
 * whichever component happened to mount second.
 *
 * Demo mode cannot catch this. Its subscriptions are a set of callbacks with
 * no such constraint, so the bug only exists against a real backend.
 */

interface FakeChannel {
  topic: string
  handlers: Array<() => void>
  subscribed: boolean
  on: (...args: unknown[]) => FakeChannel
  subscribe: (cb: (status: string) => void) => FakeChannel
}

function fakeClient() {
  const created: FakeChannel[] = []
  const removed: FakeChannel[] = []

  const client = {
    channel(topic: string) {
      const channel: FakeChannel = {
        topic,
        handlers: [],
        subscribed: false,
        on(..._args: unknown[]) {
          // The handler is the last argument on every `.on` overload used here.
          const handler = _args[_args.length - 1] as () => void
          channel.handlers.push(handler)
          return channel
        },
        subscribe(cb: (status: string) => void) {
          if (channel.subscribed) {
            // What Supabase does: a topic cannot be joined twice.
            throw new Error('tried to subscribe multiple times')
          }
          channel.subscribed = true
          cb('SUBSCRIBED')
          return channel
        },
      }
      created.push(channel)
      return channel
    },
    removeChannel(channel: FakeChannel) {
      removed.push(channel)
      return Promise.resolve('ok')
    },
  }

  return { client: client as unknown as SupabaseClient, created, removed }
}

describe('realtime subscriptions', () => {
  it('opens one channel however many screens are listening', () => {
    const { client, created } = fakeClient()
    const service = new SupabaseService(client)

    const offA = service.subscribeSongRequests('event-1', () => {})
    const offB = service.subscribeSongRequests('event-1', () => {})
    const offC = service.subscribeSongRequests('event-1', () => {})

    expect(created).toHaveLength(1)
    offA()
    offB()
    offC()
  })

  it('delivers a change to every listener, not just the first', async () => {
    const { client, created } = fakeClient()
    const service = new SupabaseService(client)

    const seen: string[] = []
    service.subscribeSongRequests('event-1', () => seen.push('panel'))
    service.subscribeSongRequests('event-1', () => seen.push('player'))
    service.subscribeSongRequests('event-1', () => seen.push('auto-accept'))

    // The first subscriber is woken by the join itself; the two that arrive
    // after it is already live are nudged on a microtask, so let those run.
    await Promise.resolve()
    await Promise.resolve()
    expect([...seen].sort()).toEqual(['auto-accept', 'panel', 'player'])

    // And a real change reaches all three.
    seen.length = 0
    for (const handler of created[0]!.handlers) handler()
    expect(seen).toEqual(['panel', 'player', 'auto-accept'])
  })

  it('keeps the channel while anyone is still watching', () => {
    const { client, removed } = fakeClient()
    const service = new SupabaseService(client)

    const offA = service.subscribeSongRequests('event-1', () => {})
    const offB = service.subscribeSongRequests('event-1', () => {})

    offA()
    expect(removed).toHaveLength(0)

    offB()
    expect(removed).toHaveLength(1)
  })

  it('opens a fresh channel once the last listener has gone', () => {
    const { client, created } = fakeClient()
    const service = new SupabaseService(client)

    service.subscribeSongRequests('event-1', () => {})()
    service.subscribeSongRequests('event-1', () => {})

    expect(created).toHaveLength(2)
  })

  it('keeps different topics apart', () => {
    const { client, created } = fakeClient()
    const service = new SupabaseService(client)

    service.subscribeSongRequests('event-1', () => {})
    service.subscribeSongRequests('event-2', () => {})
    service.subscribeEvent('event-1', () => {})
    service.subscribeVotingRounds('event-1', () => {})

    expect(created.map((c) => c.topic).sort()).toEqual([
      'event:event-1',
      'requests:event-1',
      'requests:event-2',
      'rounds:event-1',
    ])
  })

  /** Unsubscribing twice happens on a fast unmount; it must not misfire. */
  it('survives being unsubscribed twice', () => {
    const { client, removed } = fakeClient()
    const service = new SupabaseService(client)

    const off = service.subscribeSongRequests('event-1', () => {})
    off()
    off()

    expect(removed).toHaveLength(1)
  })
})

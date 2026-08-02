import { beforeEach, describe, expect, it } from 'vitest'
import { queueOrderWithFirst } from '../../src/features/requests/usePlayNext'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import type { SongRequest } from '../../src/types/domain'

function queued(id: string, queuePosition: number): SongRequest {
  return {
    id,
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title: id,
    artist: 'Artist',
    voteCount: 1,
    status: 'queued',
    queuePosition,
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('queueOrderWithFirst', () => {
  it('moves the request to the front and keeps the rest in order', () => {
    const order = queueOrderWithFirst(
      [queued('a', 0), queued('b', 1), queued('c', 2)],
      'c',
    )
    expect(order).toEqual(['c', 'a', 'b'])
  })

  it('sorts by queue position rather than trusting the array order', () => {
    const order = queueOrderWithFirst(
      [queued('c', 2), queued('a', 0), queued('b', 1)],
      'b',
    )
    expect(order).toEqual(['b', 'a', 'c'])
  })

  it('handles a request that is not queued yet', () => {
    const order = queueOrderWithFirst([queued('a', 0), queued('b', 1)], 'new')
    expect(order).toEqual(['new', 'a', 'b'])
  })

  it('is a no-op ordering when the request is already first', () => {
    const order = queueOrderWithFirst([queued('a', 0), queued('b', 1)], 'a')
    expect(order).toEqual(['a', 'b'])
  })
})

/**
 * The hook leans on two backend behaviours: queueing appends to the *back*,
 * and reorderQueue is authoritative. Both are pinned here, because "Play next"
 * silently becomes "play last" if the first one ever changes.
 */
describe('play next against the demo backend', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    const event = await service.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id
  })

  const queueTitles = async () =>
    (await service.listSongRequests(eventId, { statuses: ['queued'] }))
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
      .map((r) => r.title)

  it('appends to the back when simply queued', async () => {
    const before = await queueTitles()
    const pepas = (await service.listSongRequests(eventId)).find(
      (r) => r.title === 'Pepas',
    )!

    await service.updateRequestStatus(pepas.id, 'queued')

    expect(await queueTitles()).toEqual([...before, 'Pepas'])
  })

  it('jumps to the front after the reorder', async () => {
    const before = await queueTitles()
    const pepas = (await service.listSongRequests(eventId)).find(
      (r) => r.title === 'Pepas',
    )!

    await service.updateRequestStatus(pepas.id, 'queued')
    const nowQueued = await service.listSongRequests(eventId, {
      statuses: ['queued'],
    })
    await service.reorderQueue(eventId, queueOrderWithFirst(nowQueued, pepas.id))

    expect(await queueTitles()).toEqual(['Pepas', ...before])
  })

  it('promotes an already-queued song without duplicating it', async () => {
    const before = await queueTitles()
    expect(before.length).toBeGreaterThan(1)

    const last = (await service.listSongRequests(eventId, {
      statuses: ['queued'],
    })).sort((a, b) => (b.queuePosition ?? 0) - (a.queuePosition ?? 0))[0]!

    await service.reorderQueue(
      eventId,
      queueOrderWithFirst(
        await service.listSongRequests(eventId, { statuses: ['queued'] }),
        last.id,
      ),
    )

    const after = await queueTitles()
    expect(after[0]).toBe(last.title)
    expect(after).toHaveLength(before.length)
    expect([...after].sort()).toEqual([...before].sort())
  })
})

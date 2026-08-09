import { beforeEach, describe, expect, it } from 'vitest'
import {
  isAlreadyIn,
  partitionNew,
  playedOrPendingKeys,
  skippedMessage,
} from '../../src/features/requests/duplicates'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import type { SongRequest } from '../../src/types/domain'

/**
 * Not playing the same song twice in one night.
 *
 * A guest asking for something already asked for is caught where they ask. The
 * DJ's own paths had no equivalent, and the commonest gesture makes it obvious:
 * load a set, load another, come back to the first later, and every track in it
 * is queued twice.
 */

let seq = 0

function request(overrides: Partial<SongRequest> = {}): SongRequest {
  seq += 1
  return {
    id: `r${seq}`,
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title: 'Levitating',
    artist: 'Dua Lipa',
    voteCount: 0,
    status: 'queued',
    queuePosition: seq,
    queueGroup: 'main',
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('what counts as already on', () => {
  it('matches the same song however it was typed', () => {
    const keys = playedOrPendingKeys([request({ title: 'Don’t Stop Me Now' })])
    expect(isAlreadyIn(keys, { title: "Don't Stop Me Now", artist: 'Dua Lipa' })).toBe(
      true,
    )
  })

  it('counts a song already played, not just one waiting', () => {
    const keys = playedOrPendingKeys([request({ status: 'played' })])
    expect(isAlreadyIn(keys, { title: 'Levitating', artist: 'Dua Lipa' })).toBe(
      true,
    )
  })

  /**
   * Turning a request down is not the same as playing it — a DJ who declined
   * something should still be able to put it on themselves later.
   */
  it('does not count a declined song', () => {
    const keys = playedOrPendingKeys([request({ status: 'declined' })])
    expect(isAlreadyIn(keys, { title: 'Levitating', artist: 'Dua Lipa' })).toBe(
      false,
    )
  })

  /**
   * Exact matches only, unlike the guest-facing nudge. These songs came from a
   * catalogue, so a near-miss is far more likely to be a different recording —
   * a remix, a live cut — and dropping one of those silently would be worse
   * than the duplicate it prevented.
   */
  it('treats a different recording as a different song', () => {
    const keys = playedOrPendingKeys([request()])
    expect(
      isAlreadyIn(keys, { title: 'Levitating (Live)', artist: 'Dua Lipa' }),
    ).toBe(false)
  })
})

describe('splitting a batch', () => {
  it('keeps what is new and reports what was skipped', () => {
    const existing = [request({ title: 'One', artist: 'A' })]
    const { fresh, duplicates } = partitionNew(
      [
        { title: 'One', artist: 'A' },
        { title: 'Two', artist: 'B' },
      ],
      existing,
    )
    expect(fresh.map((s) => s.title)).toEqual(['Two'])
    expect(duplicates.map((s) => s.title)).toEqual(['One'])
  })

  /** A set that lists the same song twice must not sneak one past the check. */
  it('catches a repeat inside the batch itself', () => {
    const { fresh, duplicates } = partitionNew(
      [
        { title: 'Same', artist: 'A' },
        { title: 'same', artist: 'a' },
      ],
      [],
    )
    expect(fresh).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
  })
})

describe('what the DJ is told', () => {
  it('says nothing when nothing was skipped', () => {
    expect(skippedMessage(5, 0)).toBeNull()
  })

  it('explains a set that added nothing', () => {
    expect(skippedMessage(0, 12)).toMatch(/already on/i)
  })

  it('gives both numbers when only some landed', () => {
    expect(skippedMessage(3, 9)).toMatch(/3/)
    expect(skippedMessage(3, 9)).toMatch(/9/)
  })
})

describe('against the demo backend', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    eventId = (await service.getEventByCode(DEMO_EVENT_CODE))!.id
  })

  /** The bug this exists for. */
  it('adds a set once, however many times it is loaded', async () => {
    const set = await service.createDjSet('Twice')
    await service.addSongToSet(set.id, { title: 'Unique One', artist: 'A' })
    await service.addSongToSet(set.id, { title: 'Unique Two', artist: 'B' })

    const first = await service.loadSetIntoQueue(eventId, set.id)
    expect(first).toEqual({ added: 2, skipped: 0 })

    const second = await service.loadSetIntoQueue(eventId, set.id)
    expect(second).toEqual({ added: 0, skipped: 2 })

    const queue = await service.listSongRequests(eventId, {
      statuses: ['queued'],
    })
    expect(queue.filter((r) => r.title === 'Unique One')).toHaveLength(1)
  })

  it('refuses a song the DJ adds that is already coming up', async () => {
    await service.addDjSong({ eventId, title: 'Only Once', artist: 'A' })

    await expect(
      service.addDjSong({ eventId, title: 'only once', artist: 'a' }),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('still lets the DJ add something they declined earlier', async () => {
    const added = await service.addDjSong({
      eventId,
      title: 'Second Chance',
      artist: 'A',
    })
    await service.updateRequestStatus(added.id, 'declined')

    const again = await service.addDjSong({
      eventId,
      title: 'Second Chance',
      artist: 'A',
    })
    expect(again.status).toBe('queued')
  })
})

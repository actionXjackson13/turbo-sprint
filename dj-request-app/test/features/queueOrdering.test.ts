import { describe, expect, it } from 'vitest'
import {
  countRoomSongs,
  isDjSong,
  isRoomSong,
  queueOrderWithRequestAhead,
} from '../../src/features/requests/queueOrdering'
import type { SongRequest } from '../../src/types/domain'

/**
 * The rule that keeps the app a request app.
 *
 * A DJ can now drop a thirty-song set into the queue in one tap. Without this,
 * a guest request queued afterwards lands at position thirty-one — two hours
 * away, which is indistinguishable from being declined. Everything the app is
 * for depends on that not happening, and it is pure arithmetic, so it is worth
 * pinning precisely.
 */

let seq = 0

function song(overrides: Partial<SongRequest> = {}): SongRequest {
  seq += 1
  return {
    id: `r${seq}`,
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title: `Song ${seq}`,
    artist: 'Artist',
    voteCount: 0,
    status: 'queued',
    queuePosition: seq,
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** The DJ's own: nobody asked for it. */
const djSong = (o: Partial<SongRequest> = {}) =>
  song({ guestId: null, sourceRoundId: null, ...o })

describe('telling whose song it is', () => {
  it('counts a guest request as the room’s', () => {
    expect(isRoomSong(song())).toBe(true)
    expect(isDjSong(song())).toBe(false)
  })

  it('counts a DJ-added song as the DJ’s', () => {
    expect(isDjSong(djSong())).toBe(true)
  })

  /**
   * A vote winner has no guest behind it either, but it is the most collective
   * thing in the app — the whole room chose it. Filing it as filler would
   * bury the one song everybody actually voted for.
   */
  it('counts a vote winner as the room’s, not the DJ’s', () => {
    const winner = song({ guestId: null, sourceRoundId: 'round-1' })
    expect(isRoomSong(winner)).toBe(true)
    expect(isDjSong(winner)).toBe(false)
  })
})

describe('where a newly queued request lands', () => {
  it('goes ahead of the DJ’s songs', () => {
    const request = song({ id: 'wanted', queuePosition: 99 })
    const queue = [
      song({ id: 'earlier-request', queuePosition: 0 }),
      djSong({ id: 'filler-1', queuePosition: 1 }),
      djSong({ id: 'filler-2', queuePosition: 2 }),
      request,
    ]

    expect(queueOrderWithRequestAhead(queue, 'wanted')).toEqual([
      'earlier-request',
      'wanted',
      'filler-1',
      'filler-2',
    ])
  })

  it('still queues behind requests that came first', () => {
    // Fair is fair: the rule lifts requests above filler, not above each other.
    const queue = [
      song({ id: 'first', queuePosition: 0 }),
      song({ id: 'second', queuePosition: 1 }),
      djSong({ id: 'filler', queuePosition: 2 }),
      song({ id: 'newest', queuePosition: 3 }),
    ]

    expect(queueOrderWithRequestAhead(queue, 'newest')).toEqual([
      'first',
      'second',
      'newest',
      'filler',
    ])
  })

  it('changes nothing when the DJ has no songs in the queue', () => {
    const queue = [
      song({ id: 'a', queuePosition: 0 }),
      song({ id: 'b', queuePosition: 1 }),
    ]
    expect(queueOrderWithRequestAhead(queue, 'b')).toEqual(['a', 'b'])
  })

  it('handles a set that fills the entire queue', () => {
    // The case this exists for: thirty songs of filler, one person asking.
    const filler = Array.from({ length: 30 }, (_, i) =>
      djSong({ id: `f${i}`, queuePosition: i }),
    )
    const request = song({ id: 'heard', queuePosition: 30 })

    const order = queueOrderWithRequestAhead([...filler, request], 'heard')
    expect(order[0]).toBe('heard')
    expect(order).toHaveLength(31)
  })

  it('places a request that is not in the queue yet', () => {
    // The caller may reorder in the same breath as queueing, before a reload.
    const queue = [djSong({ id: 'filler', queuePosition: 0 })]
    expect(queueOrderWithRequestAhead(queue, 'brand-new')).toEqual([
      'brand-new',
      'filler',
    ])
  })

  it('keeps a vote winner ahead of filler too', () => {
    const queue = [
      djSong({ id: 'filler', queuePosition: 0 }),
      song({ id: 'winner', guestId: null, sourceRoundId: 'r1', queuePosition: 1 }),
    ]
    expect(queueOrderWithRequestAhead(queue, 'winner')).toEqual([
      'winner',
      'filler',
    ])
  })
})

describe('how much of the queue the room asked for', () => {
  it('counts requests and vote winners, not filler', () => {
    const queue = [
      song(),
      song(),
      djSong(),
      djSong(),
      djSong(),
      song({ guestId: null, sourceRoundId: 'r1' }),
    ]
    expect(countRoomSongs(queue)).toBe(3)
  })
})

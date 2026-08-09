import { describe, expect, it } from 'vitest'
import {
  countRoomSongs,
  isDjSong,
  isRoomSong,
  mainCountOf,
  queueOrderMainFirst,
  splitQueue,
} from '../../src/features/requests/queueOrdering'
import type { SongRequest } from '../../src/types/domain'

/**
 * The queue in two halves, and the rule that keeps the app a request app.
 *
 * A DJ can drop a thirty-song set into the queue in one tap. If a request
 * queued afterwards landed behind it, that request is two hours away — which is
 * indistinguishable from being declined.
 *
 * The earlier version derived the answer from who added each song, which meant
 * it could be applied but never overridden: a DJ who dragged one of their own
 * songs up watched it sink again on the next request. Storing which half a song
 * is in is what makes promoting a track out of a set stick.
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

/** A song from a loaded set: the DJ's, and in the backdrop half. */
const setSong = (o: Partial<SongRequest> = {}) =>
  song({ guestId: null, sourceRoundId: null, queueGroup: 'sub', ...o })

describe('telling whose song it is', () => {
  it('counts a guest request as the room’s', () => {
    expect(isRoomSong(song())).toBe(true)
    expect(isDjSong(song())).toBe(false)
  })

  it('counts a DJ-added song as the DJ’s', () => {
    expect(isDjSong(setSong())).toBe(true)
  })

  /**
   * A vote winner has no guest behind it either, but it is the most collective
   * thing in the app — the whole room chose it.
   */
  it('counts a vote winner as the room’s, not the DJ’s', () => {
    const winner = song({ guestId: null, sourceRoundId: 'round-1' })
    expect(isRoomSong(winner)).toBe(true)
  })

  /**
   * Whose song it is and where it plays are separate questions. A DJ song
   * promoted into the main half is still the DJ's — which is what keeps the row
   * colouring honest.
   */
  it('keeps ownership independent of which half it sits in', () => {
    const promoted = setSong({ queueGroup: 'main' })
    expect(isDjSong(promoted)).toBe(true)
    expect(splitQueue([promoted]).main).toHaveLength(1)
  })
})

describe('splitting the queue', () => {
  it('separates the two halves, each in its own order', () => {
    const queue = [
      setSong({ id: 'f1', queuePosition: 2 }),
      song({ id: 'r1', queuePosition: 0 }),
      setSong({ id: 'f2', queuePosition: 3 }),
      song({ id: 'r2', queuePosition: 1 }),
    ]

    const { main, sub } = splitQueue(queue)
    expect(main.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(sub.map((r) => r.id)).toEqual(['f1', 'f2'])
  })

  it('treats a song with no half recorded as main', () => {
    // Rows queued before the halves existed are due to play, not backdrop.
    const legacy = song({ id: 'old', queueGroup: undefined as never })
    expect(splitQueue([legacy]).main.map((r) => r.id)).toEqual(['old'])
  })
})

describe('the canonical order', () => {
  it('puts the main half before the backdrop', () => {
    const queue = [
      setSong({ id: 'f1', queuePosition: 0 }),
      song({ id: 'r1', queuePosition: 1 }),
      setSong({ id: 'f2', queuePosition: 2 }),
      song({ id: 'r2', queuePosition: 3 }),
    ]

    expect(queueOrderMainFirst(queue)).toEqual(['r1', 'r2', 'f1', 'f2'])
    expect(mainCountOf(queue)).toBe(2)
  })

  /**
   * The case the whole feature exists for: a new request is written at the very
   * back of the queue, and has to end up at the end of its own half instead.
   */
  it('lifts a newly queued request out of the backdrop', () => {
    const queue = [
      song({ id: 'waiting', queuePosition: 0 }),
      setSong({ id: 'f1', queuePosition: 1 }),
      setSong({ id: 'f2', queuePosition: 2 }),
      song({ id: 'newest', queuePosition: 3 }),
    ]

    expect(queueOrderMainFirst(queue)).toEqual([
      'waiting',
      'newest',
      'f1',
      'f2',
    ])
  })

  /**
   * The thing the derived version could not do. A DJ promotes one track out of
   * a set; every request that arrives afterwards queues *behind* it, and it
   * still sits ahead of the rest of the set.
   */
  it('keeps a promoted set song above later requests', () => {
    const queue = [
      song({ id: 'early', queuePosition: 0 }),
      setSong({ id: 'promoted', queueGroup: 'main', queuePosition: 1 }),
      setSong({ id: 'rest', queuePosition: 2 }),
      song({ id: 'later', queuePosition: 3 }),
    ]

    expect(queueOrderMainFirst(queue)).toEqual([
      'early',
      'promoted',
      'later',
      'rest',
    ])
  })

  it('rescues a vote winner that landed at the back', () => {
    const queue = [
      setSong({ id: 'f1', queuePosition: 0 }),
      setSong({ id: 'f2', queuePosition: 1 }),
      song({
        id: 'winner',
        guestId: null,
        sourceRoundId: 'r1',
        queuePosition: 2,
      }),
    ]
    expect(queueOrderMainFirst(queue)[0]).toBe('winner')
  })

  it('keeps the order the DJ chose inside each half', () => {
    const queue = [
      song({ id: 'second', queuePosition: 0 }),
      song({ id: 'first', queuePosition: 1 }),
      setSong({ id: 'fB', queuePosition: 2 }),
      setSong({ id: 'fA', queuePosition: 3 }),
    ]
    expect(queueOrderMainFirst(queue)).toEqual(['second', 'first', 'fB', 'fA'])
  })

  it('is idempotent', () => {
    const queue = [
      setSong({ id: 'f1', queuePosition: 0 }),
      song({ id: 'r1', queuePosition: 1 }),
    ]
    const once = queueOrderMainFirst(queue)
    const renumbered = once.map((id, i) => ({
      ...queue.find((r) => r.id === id)!,
      queuePosition: i,
    }))
    expect(queueOrderMainFirst(renumbered)).toEqual(once)
  })

  it('leaves a queue that is all backdrop alone', () => {
    const queue = [
      setSong({ id: 'a', queuePosition: 0 }),
      setSong({ id: 'b', queuePosition: 1 }),
    ]
    expect(queueOrderMainFirst(queue)).toEqual(['a', 'b'])
    expect(mainCountOf(queue)).toBe(0)
  })
})

describe('how much of the queue the room asked for', () => {
  it('counts requests and vote winners, wherever they sit', () => {
    const queue = [
      song(),
      song(),
      setSong(),
      setSong(),
      song({ guestId: null, sourceRoundId: 'r1' }),
    ]
    expect(countRoomSongs(queue)).toBe(3)
  })
})

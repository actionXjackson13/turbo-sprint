import { describe, expect, it } from 'vitest'
import { findQueuedMatch } from '../../src/features/requests/nowPlayingMatch'
import type { SongRequest } from '../../src/types/domain'

/**
 * Tying "what I just dropped" back to "what somebody asked for".
 *
 * A DJ on their own decks names the song that is on. Most of the time it is
 * theirs and nobody asked for it — but sometimes it is the request sitting
 * third in the queue, played out of order because it fitted. Getting that right
 * is what keeps the queue honest: miss the match and the guest who asked is
 * still told their song is waiting while it is audibly playing; make a wrong
 * match and somebody's song is marked played when it never was.
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

describe('finding the request a now-playing song came from', () => {
  it('finds nothing in an empty queue', () => {
    expect(
      findQueuedMatch([], { title: 'Levitating', artist: 'Dua Lipa' }),
    ).toBeNull()
  })

  it('leaves the DJ’s own track unmatched', () => {
    const queue = [request({ title: 'Levitating', artist: 'Dua Lipa' })]
    expect(
      findQueuedMatch(queue, { title: 'Blue Monday', artist: 'New Order' }),
    ).toBeNull()
  })

  it('matches on title and artist', () => {
    const wanted = request({ title: 'Blue Monday', artist: 'New Order' })
    const queue = [request(), wanted, request({ title: 'Titanium' })]

    expect(
      findQueuedMatch(queue, { title: 'Blue Monday', artist: 'New Order' })?.id,
    ).toBe(wanted.id)
  })

  /** The whole point of normalising: the two spellings are the same song. */
  it('sees past punctuation and case', () => {
    const wanted = request({ title: "Don't Stop Me Now", artist: 'Queen' })

    expect(
      findQueuedMatch([wanted], { title: 'DONT STOP ME NOW', artist: 'queen' })
        ?.id,
    ).toBe(wanted.id)
  })

  /**
   * Same title, different artist, is a different song. Folding the artist in
   * is what keeps Adele's "Hello" away from Lionel Richie's.
   */
  it('does not match a different artist', () => {
    const queue = [request({ title: 'Hello', artist: 'Adele' })]
    expect(
      findQueuedMatch(queue, { title: 'Hello', artist: 'Lionel Richie' }),
    ).toBeNull()
  })

  /**
   * The catalogue id is an identity rather than a guess, so it wins — a remix
   * and its original share a title and an artist but are not the same record,
   * and the id is the only thing that can tell them apart.
   */
  it('prefers the catalogue id over the title', () => {
    const remix = request({
      title: 'Levitating',
      artist: 'Dua Lipa',
      catalogId: '2222',
    })
    const original = request({
      title: 'Levitating',
      artist: 'Dua Lipa',
      catalogId: '1111',
    })

    expect(
      findQueuedMatch([remix, original], {
        id: '1111',
        title: 'Levitating',
        artist: 'Dua Lipa',
      })?.id,
    ).toBe(original.id)
  })

  /**
   * An id that nothing in the queue carries is not a reason to give up: the
   * request may have been typed by a guest, and the DJ may have picked the same
   * song from a catalogue. The names still line up.
   */
  it('falls back to the title when the id is not in the queue', () => {
    const typed = request({ title: 'Levitating', artist: 'Dua Lipa' })

    expect(
      findQueuedMatch([typed], {
        id: '9999',
        title: 'Levitating',
        artist: 'Dua Lipa',
      })?.id,
    ).toBe(typed.id)
  })

  it('returns the first match when a song is queued twice', () => {
    const first = request({ title: 'Titanium', artist: 'David Guetta' })
    const second = request({ title: 'Titanium', artist: 'David Guetta' })

    expect(
      findQueuedMatch([first, second], {
        title: 'Titanium',
        artist: 'David Guetta',
      })?.id,
    ).toBe(first.id)
  })
})

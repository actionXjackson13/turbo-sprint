import { describe, expect, it } from 'vitest'
import {
  REQUEST_LIST_LIMIT,
  selectMostWanted,
  selectRecent,
} from '../../src/features/requests/requestLists'
import type { RequestStatus, SongRequest } from '../../src/types/domain'

/**
 * The guest event screen and the DJ control panel both render this list. If
 * they ever disagreed, the DJ would be reading a different room than the one
 * in front of them — so the rule lives in one place and is pinned here.
 */

let seq = 0

function request(
  votes: number,
  status: RequestStatus = 'pending',
  minutesAgo = seq++,
): SongRequest {
  return {
    id: `req-${votes}-${status}-${minutesAgo}`,
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title: `Song ${minutesAgo}`,
    artist: 'Artist',
    voteCount: votes,
    status,
    queuePosition: null,
    sourceRoundId: null,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }
}

describe('selectMostWanted', () => {
  it('ranks by votes, highest first', () => {
    const ranked = selectMostWanted([
      request(2),
      request(9),
      request(5),
    ])
    expect(ranked.map((r) => r.voteCount)).toEqual([9, 5, 2])
  })

  it('keeps pending, accepted and queued requests', () => {
    const ranked = selectMostWanted([
      request(3, 'pending'),
      request(3, 'accepted'),
      request(3, 'queued'),
    ])
    expect(ranked.map((r) => r.status)).toEqual([
      'pending',
      'accepted',
      'queued',
    ])
  })

  it('drops finished business so a dealt-with song cannot pin the top', () => {
    const ranked = selectMostWanted([
      request(99, 'played'),
      request(99, 'declined'),
      request(1, 'pending'),
    ])
    expect(ranked.map((r) => r.status)).toEqual(['pending'])
  })

  it('breaks ties towards the newer request', () => {
    const older = request(4, 'pending', 60)
    const newer = request(4, 'pending', 5)
    expect(selectMostWanted([older, newer])[0]).toBe(newer)
    // Same answer whatever order the caller loaded in.
    expect(selectMostWanted([newer, older])[0]).toBe(newer)
  })

  it('caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => request(i))
    expect(selectMostWanted(many)).toHaveLength(REQUEST_LIST_LIMIT)
    expect(selectMostWanted(many, 3)).toHaveLength(3)
  })

  it('does not reorder the array it was given', () => {
    const input = [request(1), request(8), request(4)]
    const snapshot = input.map((r) => r.id)
    selectMostWanted(input)
    expect(input.map((r) => r.id)).toEqual(snapshot)
  })
})

describe('selectRecent', () => {
  it('orders newest first', () => {
    const oldest = request(0, 'pending', 90)
    const middle = request(0, 'pending', 40)
    const newest = request(0, 'pending', 2)
    expect(selectRecent([middle, oldest, newest])).toEqual([
      newest,
      middle,
      oldest,
    ])
  })

  it('keeps played requests but hides declined ones', () => {
    const ranked = selectRecent([
      request(1, 'played', 30),
      request(1, 'declined', 20),
      request(1, 'queued', 10),
    ])
    expect(ranked.map((r) => r.status)).toEqual(['queued', 'played'])
  })

  it('caps the list and leaves the input alone', () => {
    const many = Array.from({ length: 9 }, (_, i) => request(0, 'pending', i))
    const snapshot = many.map((r) => r.id)
    expect(selectRecent(many)).toHaveLength(REQUEST_LIST_LIMIT)
    expect(selectRecent(many, 2)).toHaveLength(2)
    expect(many.map((r) => r.id)).toEqual(snapshot)
  })
})

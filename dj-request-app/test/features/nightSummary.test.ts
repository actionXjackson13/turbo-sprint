import { describe, expect, it } from 'vitest'
import {
  buildNightSummary,
  summaryHeadline,
} from '../../src/features/requests/nightSummary'
import type { SongRequest } from '../../src/types/domain'

/**
 * The record of a night.
 *
 * The judgement worth pinning is what counts as a miss. A set song that never
 * came up is backdrop the night did not need; a request nobody played is the
 * one thing here that might change what a DJ does next time. Counting the first
 * as a disappointment would bury the second under the whole unplayed set.
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
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    updatedAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    ...overrides,
  }
}

const djSong = (o: Partial<SongRequest> = {}) =>
  song({ guestId: null, sourceRoundId: null, ...o })

describe('what played', () => {
  it('lists played songs in the order they were played', () => {
    const summary = buildNightSummary([
      song({ id: 'second', status: 'played', updatedAt: '2026-01-01T02:00:00Z' }),
      song({ id: 'first', status: 'played', updatedAt: '2026-01-01T01:00:00Z' }),
      song({ id: 'waiting' }),
    ])
    expect(summary.played.map((r) => r.id)).toEqual(['first', 'second'])
  })

  it('counts how many of them the room asked for', () => {
    const summary = buildNightSummary([
      song({ status: 'played' }),
      song({ status: 'played' }),
      djSong({ status: 'played' }),
    ])
    expect(summary.played).toHaveLength(3)
    expect(summary.playedFromRoom).toBe(2)
  })
})

describe('what never made it on', () => {
  it('counts a request nobody played', () => {
    const summary = buildNightSummary([song({ id: 'unplayed' })])
    expect(summary.missed.map((r) => r.id)).toEqual(['unplayed'])
  })

  /** Backdrop the night did not need is not a disappointment. */
  it('does not count an unplayed set song', () => {
    const summary = buildNightSummary([djSong({ id: 'filler' })])
    expect(summary.missed).toEqual([])
  })

  it('does not count something the DJ declined', () => {
    const summary = buildNightSummary([song({ status: 'declined' })])
    expect(summary.missed).toEqual([])
  })

  it('puts the most-voted misses first', () => {
    const summary = buildNightSummary([
      song({ id: 'quiet', voteCount: 1 }),
      song({ id: 'loud', voteCount: 9 }),
    ])
    expect(summary.missed[0]!.id).toBe('loud')
  })
})

describe('most wanted', () => {
  it('ranks by votes and ignores the DJ’s own songs', () => {
    const summary = buildNightSummary([
      song({ id: 'a', voteCount: 3 }),
      song({ id: 'b', voteCount: 7 }),
      djSong({ id: 'dj', voteCount: 99 }),
    ])
    expect(summary.mostWanted.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('leaves out songs nobody voted for', () => {
    const summary = buildNightSummary([song({ voteCount: 0 })])
    expect(summary.mostWanted).toEqual([])
  })

  it('keeps the list short enough to read', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      song({ voteCount: i + 1 }),
    )
    expect(buildNightSummary(many).mostWanted).toHaveLength(5)
  })
})

describe('the headline', () => {
  it('leads with what the room got', () => {
    const summary = buildNightSummary([
      song({ status: 'played' }),
      djSong({ status: 'played' }),
      song({ id: 'waiting' }),
    ])
    expect(summaryHeadline(summary)).toBe('2 songs played, 1 of them requested.')
  })

  it('says so when nothing played', () => {
    expect(summaryHeadline(buildNightSummary([]))).toBe('No songs played.')
  })

  it('drops the request clause when nobody asked for anything', () => {
    const summary = buildNightSummary([djSong({ status: 'played' })])
    expect(summaryHeadline(summary)).toBe('1 song played.')
  })
})

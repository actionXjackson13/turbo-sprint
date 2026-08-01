import { describe, expect, it } from 'vitest'
import {
  SIMILAR_REQUEST_THRESHOLD,
  trigramSimilarity,
  trigrams,
} from '../../src/utils/similarity'
import { songMatchKey } from '../../src/utils/normalizeText'

/**
 * The scoring here has to agree with pg_trgm's `similarity()`, since demo mode
 * and Postgres must reach the same verdict on whether two requests are the
 * same song. The migration test asserts the SQL side of the same cases.
 */
describe('trigrams', () => {
  it('pads each word with two leading and one trailing space', () => {
    expect([...trigrams('cat')].sort()).toEqual(['  c', ' ca', 'at ', 'cat'])
  })

  it('handles single-character words', () => {
    expect([...trigrams('a')].sort()).toEqual(['  a', ' a '])
  })

  it('unions the trigrams of every word', () => {
    const set = trigrams('a b')
    expect(set.has('  a')).toBe(true)
    expect(set.has('  b')).toBe(true)
  })

  it('ignores empty segments', () => {
    expect(trigrams('').size).toBe(0)
  })
})

describe('trigramSimilarity', () => {
  it('scores identical strings 1', () => {
    expect(trigramSimilarity('levitating', 'levitating')).toBe(1)
  })

  it('scores disjoint strings low', () => {
    expect(trigramSimilarity('titanium', 'padam')).toBeLessThan(0.2)
  })

  it('is symmetric', () => {
    const a = 'blinding lights the weeknd'
    const b = 'blinding light the weekend'
    expect(trigramSimilarity(a, b)).toBeCloseTo(trigramSimilarity(b, a), 10)
  })

  it('treats two empty strings as identical and one as no match', () => {
    expect(trigramSimilarity('', '')).toBe(1)
    expect(trigramSimilarity('', 'x')).toBe(0)
  })
})

/**
 * These are the cases the threshold was chosen against. They are the real
 * contract — if a change to normalisation or scoring breaks one of these, the
 * duplicate nudge has regressed in a way users would feel.
 */
describe('duplicate detection threshold', () => {
  const score = (
    [t1, a1]: [string, string],
    [t2, a2]: [string, string],
  ): number => trigramSimilarity(songMatchKey(t1, a1), songMatchKey(t2, a2))

  const DUPLICATES: [[string, string], [string, string]][] = [
    [["Don't Stop Believing", 'Journey'], ['Dont Stop Believin', 'Journey']],
    [['Levitating', 'Dua Lipa'], ['levitating', 'dua lipa']],
    [['Blinding Lights', 'The Weeknd'], ['Blinding Light', 'The Weekend']],
    [['Mr. Brightside', 'The Killers'], ['Mr Brightside', 'Killers']],
    [['Sweet Caroline', 'Neil Diamond'], ['Sweet Carolina', 'Neil Diamond']],
    [
      ['September', 'Earth, Wind & Fire'],
      ['September', 'Earth Wind and Fire'],
    ],
    [
      ['Murder On The Dancefloor', 'Sophie Ellis-Bextor'],
      ['Murder on the Dance floor', 'Sophie Ellis Bextor'],
    ],
  ]

  const DISTINCT: [[string, string], [string, string]][] = [
    [['Hello', 'Adele'], ['Hello', 'Lionel Richie']],
    [['Sorry', 'Justin Bieber'], ['Sorry Not Sorry', 'Demi Lovato']],
    [['Levitating', 'Dua Lipa'], ['Physical', 'Dua Lipa']],
    [['September', 'Earth Wind and Fire'], ['November Rain', 'Guns N Roses']],
    [['Titanium', 'David Guetta'], ['Padam Padam', 'Kylie Minogue']],
    [['One', 'U2'], ['One Dance', 'Drake']],
    [['Yesterday', 'The Beatles'], ['Let It Be', 'The Beatles']],
  ]

  it.each(DUPLICATES)('treats %j and %j as the same song', (a, b) => {
    expect(score(a, b)).toBeGreaterThanOrEqual(SIMILAR_REQUEST_THRESHOLD)
  })

  it.each(DISTINCT)('keeps %j and %j apart', (a, b) => {
    expect(score(a, b)).toBeLessThan(SIMILAR_REQUEST_THRESHOLD)
  })

  it('leaves headroom on both sides of the threshold', () => {
    const worstDuplicate = Math.min(...DUPLICATES.map(([a, b]) => score(a, b)))
    const worstDistinct = Math.max(...DISTINCT.map(([a, b]) => score(a, b)))

    // Neither class should sit right on the boundary, or small wording changes
    // would start flipping verdicts.
    expect(worstDuplicate - SIMILAR_REQUEST_THRESHOLD).toBeGreaterThan(0.1)
    expect(SIMILAR_REQUEST_THRESHOLD - worstDistinct).toBeGreaterThan(0.1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  normalizeSongText,
  songMatchKey,
} from '../../src/utils/normalizeText'

/**
 * These cases are the contract shared with the `normalize_song_text` SQL
 * function in supabase/migrations/0002_functions_triggers.sql. If you change
 * one implementation, change the other and keep these passing.
 */
describe('normalizeSongText', () => {
  it('lowercases', () => {
    expect(normalizeSongText('Dancing Queen')).toBe('dancing queen')
  })

  it('trims and collapses whitespace', () => {
    expect(normalizeSongText('  Get   Lucky  ')).toBe('get lucky')
  })

  it('strips punctuation', () => {
    expect(normalizeSongText('Hello, World! (Remix)')).toBe(
      'hello world remix',
    )
  })

  it('deletes apostrophes rather than splitting the word', () => {
    // "don t" would match neither "dont" nor "don't", so both spellings of a
    // song would live as separate requests.
    expect(normalizeSongText("Don't Stop Believin'")).toBe(
      'dont stop believin',
    )
    expect(normalizeSongText("Don't")).toBe(normalizeSongText('Dont'))
  })

  it('treats typographic apostrophes like straight ones', () => {
    expect(normalizeSongText('Don’t')).toBe('dont')
    expect(normalizeSongText('Donʼt')).toBe('dont')
  })

  it('keeps digits', () => {
    expect(normalizeSongText('99 Problems')).toBe('99 problems')
  })

  it('keeps non-ASCII letters rather than deleting them', () => {
    expect(normalizeSongText('Tomás')).toBe('tomás')
    expect(normalizeSongText('Björk')).toBe('björk')
  })

  it('handles an empty string', () => {
    expect(normalizeSongText('   ')).toBe('')
  })
})

describe('songMatchKey', () => {
  it('treats punctuation and casing differences as the same song', () => {
    expect(songMatchKey('Blinding Lights', 'The Weeknd')).toBe(
      songMatchKey('  blinding   lights ', 'the weeknd!'),
    )
  })

  it('distinguishes different artists', () => {
    expect(songMatchKey('Hello', 'Adele')).not.toBe(
      songMatchKey('Hello', 'Lionel Richie'),
    )
  })
})

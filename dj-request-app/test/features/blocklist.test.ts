import { beforeEach, describe, expect, it } from 'vitest'
import {
  addBlocked,
  isBlocked,
  listBlocked,
  removeBlocked,
} from '../../src/features/requests/blocklist'

/**
 * Songs the DJ never plays.
 *
 * Matching is loose on purpose, and in the opposite direction to the duplicate
 * check. A blocklist entry is something the DJ typed as a rule rather than
 * picked from a catalogue, so it has to survive every decoration a real title
 * arrives wearing — "(Radio Edit)", "- Remastered 2011", a feature credit. A
 * near-miss costs one declined request, which the DJ can reverse; a miss costs
 * them the thing they were trying to avoid, in front of everyone.
 */

beforeEach(() => localStorage.clear())

describe('keeping the list', () => {
  it('starts empty and remembers what is added', () => {
    expect(listBlocked()).toEqual([])
    addBlocked('Baby Shark')
    expect(listBlocked().map((e) => e.text)).toEqual(['Baby Shark'])
  })

  it('shows the entry back as it was typed', () => {
    addBlocked('  The Birdie Song  ')
    expect(listBlocked()[0]!.text).toBe('The Birdie Song')
  })

  it('does not add the same rule twice', () => {
    addBlocked('Baby Shark')
    addBlocked('baby   shark')
    expect(listBlocked()).toHaveLength(1)
  })

  it('ignores an entry with nothing in it', () => {
    addBlocked('   ')
    expect(listBlocked()).toEqual([])
  })

  it('unblocks', () => {
    addBlocked('Baby Shark')
    const key = listBlocked()[0]!.key
    expect(removeBlocked(key)).toEqual([])
  })

  it('survives storage holding something else entirely', () => {
    localStorage.setItem('soundboard.blocklist', 'not json')
    expect(listBlocked()).toEqual([])
  })
})

describe('what gets caught', () => {
  it('matches the song it names', () => {
    addBlocked('Baby Shark')
    expect(isBlocked({ title: 'Baby Shark', artist: 'Pinkfong' })).toBeTruthy()
  })

  /** The decorations an exact match would trip over. */
  it('matches through remixes, edits and remasters', () => {
    addBlocked('Baby Shark')
    expect(
      isBlocked({ title: 'Baby Shark (Dance Remix)', artist: 'Pinkfong' }),
    ).toBeTruthy()
    expect(
      isBlocked({ title: 'BABY SHARK - Remastered 2019', artist: 'Pinkfong' }),
    ).toBeTruthy()
  })

  it('lets one entry stand for a whole artist', () => {
    addBlocked('Nickelback')
    expect(
      isBlocked({ title: 'How You Remind Me', artist: 'Nickelback' }),
    ).toBeTruthy()
    expect(
      isBlocked({ title: 'Photograph', artist: 'Nickelback' }),
    ).toBeTruthy()
  })

  it('ignores punctuation the guest happened to type', () => {
    addBlocked("Don't Stop Believin'")
    expect(
      isBlocked({ title: 'Dont Stop Believin', artist: 'Journey' }),
    ).toBeTruthy()
  })

  it('leaves everything else alone', () => {
    addBlocked('Baby Shark')
    expect(isBlocked({ title: 'Levitating', artist: 'Dua Lipa' })).toBeNull()
  })

  it('blocks nothing when the list is empty', () => {
    expect(isBlocked({ title: 'Anything', artist: 'Anyone' })).toBeNull()
  })

  it('says which rule caught it, so the DJ can undo that one', () => {
    addBlocked('Nickelback')
    addBlocked('Baby Shark')
    expect(
      isBlocked({ title: 'Photograph', artist: 'Nickelback' })?.text,
    ).toBe('Nickelback')
  })
})

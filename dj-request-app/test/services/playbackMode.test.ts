import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPlaybackMode,
  getPlaybackMode,
  isOwnDecks,
  setPlaybackMode,
  subscribePlaybackMode,
} from '../../src/services/player/playbackMode'

/**
 * Which rig is playing the music tonight.
 *
 * The thing that must never slip is the default. Every DJ using the app before
 * this setting existed was having it play the queue, and a stored value that
 * failed to read — private browsing, storage denied, a key someone cleared —
 * has to land on that same behaviour rather than silently switching the app
 * off mid-party.
 *
 * The subscription matters for a less obvious reason: the player bar is mounted
 * above the router and never unmounts, so a setting read once at mount would
 * leave it sitting on screen after the DJ turned it off.
 */

beforeEach(() => {
  localStorage.clear()
  __resetPlaybackMode()
})

afterEach(() => {
  localStorage.clear()
  __resetPlaybackMode()
  vi.restoreAllMocks()
})

describe('playback mode', () => {
  it('plays in the app until told otherwise', () => {
    expect(getPlaybackMode()).toBe('in-app')
    expect(isOwnDecks()).toBe(false)
  })

  it('remembers the DJ’s own decks', () => {
    setPlaybackMode('my-own-decks')
    expect(isOwnDecks()).toBe(true)

    // A reload: the cache is gone, storage is not.
    __resetPlaybackMode()
    expect(getPlaybackMode()).toBe('my-own-decks')
  })

  it('switches back', () => {
    setPlaybackMode('my-own-decks')
    setPlaybackMode('in-app')
    expect(isOwnDecks()).toBe(false)

    __resetPlaybackMode()
    expect(getPlaybackMode()).toBe('in-app')
  })

  /** The default is not a stored value, so it should not leave one behind. */
  it('stores nothing for the default', () => {
    setPlaybackMode('my-own-decks')
    setPlaybackMode('in-app')
    expect(localStorage.getItem('soundboard.player.mode')).toBeNull()
  })

  it('reads anything unrecognised as in-app', () => {
    localStorage.setItem('soundboard.player.mode', 'vinyl-only')
    expect(getPlaybackMode()).toBe('in-app')
  })

  it('falls back to in-app when storage is unreadable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(getPlaybackMode()).toBe('in-app')
  })

  /**
   * Storage can refuse the write and the DJ still pressed the switch. The
   * choice holds for this session; it simply will not survive a reload.
   */
  it('still switches when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    setPlaybackMode('my-own-decks')
    expect(isOwnDecks()).toBe(true)
  })

  it('tells mounted screens when it changes', () => {
    const seen: string[] = []
    const off = subscribePlaybackMode(() => seen.push(getPlaybackMode()))

    setPlaybackMode('my-own-decks')
    setPlaybackMode('in-app')
    off()
    setPlaybackMode('my-own-decks')

    expect(seen).toEqual(['my-own-decks', 'in-app'])
  })

  it('says nothing when the mode is set to what it already was', () => {
    const listener = vi.fn()
    subscribePlaybackMode(listener)

    setPlaybackMode('in-app')
    expect(listener).not.toHaveBeenCalled()
  })
})

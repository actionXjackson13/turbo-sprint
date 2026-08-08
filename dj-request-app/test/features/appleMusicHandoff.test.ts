import { beforeEach, describe, expect, it } from 'vitest'
import {
  appleMusicLinkFor,
  appleMusicSearchUrl,
  canHandOff,
  isHandoffEnabled,
  searchTermFor,
  setHandoffEnabled,
} from '../../src/features/appleMusic/handoff'
import type { SongRequest } from '../../src/types/domain'

/**
 * Opening a song in Apple Music, for a DJ who would rather play it on the
 * subscription they already pay for than through the app's YouTube player.
 *
 * This replaced a Shortcut-driven version that could never have worked: Apple's
 * Shortcuts app has no action that searches the Apple Music catalogue, so the
 * shortcut the setup screen described was unbuildable. The URL is the part
 * worth pinning now — a malformed one fails as "nothing happens" on a phone,
 * which is indistinguishable from the feature being off.
 */

function request(overrides: Partial<SongRequest> = {}): SongRequest {
  return {
    id: 'req-1',
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title: 'Levitating',
    artist: 'Dua Lipa',
    voteCount: 1,
    status: 'queued',
    queuePosition: 0,
    sourceRoundId: null,
    catalogId: '1',
    artworkUrl: null,
    catalogUrl: 'https://music.apple.com/us/album/levitating/1?i=2',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('the search term handed over', () => {
  it('carries the artist, not just the title', () => {
    // Apple Music has a dozen "Levitating"s and one by Dua Lipa.
    expect(searchTermFor({ title: 'Levitating', artist: 'Dua Lipa' })).toBe(
      'Levitating Dua Lipa',
    )
  })
})

describe('the Apple Music link', () => {
  it('opens a search for the song', () => {
    const url = new URL(
      appleMusicSearchUrl({ title: 'Levitating', artist: 'Dua Lipa' }),
    )

    expect(url.host).toBe('music.apple.com')
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('term')).toBe('Levitating Dua Lipa')
  })

  it('escapes a title that would otherwise break the URL', () => {
    const url = new URL(
      appleMusicSearchUrl({ title: 'Ain’t It Fun & Loud?', artist: 'A/B' }),
    )
    expect(url.searchParams.get('term')).toBe('Ain’t It Fun & Loud? A/B')
  })

  /**
   * https rather than the music:// scheme, so the same link opens the app on a
   * phone and the web player on a laptop instead of failing at a scheme nothing
   * has registered.
   */
  it('is a universal link, not a custom scheme', () => {
    expect(appleMusicSearchUrl({ title: 'A', artist: 'B' })).toMatch(/^https:/)
  })
})

describe('which link a request gets', () => {
  it('uses the song’s own Apple Music page when the catalogue gave one', () => {
    expect(appleMusicLinkFor(request())).toBe(
      'https://music.apple.com/us/album/levitating/1?i=2',
    )
  })

  /**
   * Songs found through Deezer or typed in by hand have no Apple page, and
   * used to get no button at all — but "search Apple Music for this" works
   * perfectly well for them, so the button stays useful either way.
   */
  it('falls back to a search for a song from somewhere else', () => {
    const link = appleMusicLinkFor(
      request({ catalogUrl: 'https://www.deezer.com/track/1' }),
    )
    expect(link).toContain('music.apple.com/search')
    expect(link).toContain('Levitating')

    expect(appleMusicLinkFor(request({ catalogUrl: null }))).toContain(
      'music.apple.com/search',
    )
  })
})

describe('whether it is offered', () => {
  it('follows the DJ’s choice, and is off until they make it', () => {
    expect(isHandoffEnabled()).toBe(false)
    expect(canHandOff()).toBe(false)

    setHandoffEnabled(true)
    expect(canHandOff()).toBe(true)

    setHandoffEnabled(false)
    expect(canHandOff()).toBe(false)
  })
})

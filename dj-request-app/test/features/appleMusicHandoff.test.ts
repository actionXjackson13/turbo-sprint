import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHORTCUT_NAME,
  appleMusicLinkFor,
  canHandOff,
  getShortcutName,
  isHandoffEnabled,
  searchTermFor,
  setHandoffEnabled,
  setShortcutName,
  shortcutUrlFor,
  supportsShortcuts,
} from '../../src/features/appleMusic/handoff'
import type { SongRequest } from '../../src/types/domain'

/**
 * The hand-off exists so the DJ can play requests on the subscription they
 * already pay for, instead of $99 a year for the licence to play them inside
 * this app.
 *
 * The URL is the part worth pinning. A wrong one fails *silently* on a phone —
 * iOS simply does nothing — so a typo here would surface as "the button does
 * nothing" mid-party, with no way to tell it from an unset Shortcut.
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

function pretendUserAgent(ua: string, touchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  // jsdom does not define maxTouchPoints at all, so it cannot be spied on —
  // which is also why the code under test must tolerate it being undefined.
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: touchPoints,
    configurable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the search term handed over', () => {
  it('carries the artist, not just the title', () => {
    // Apple Music has a dozen "Levitating"s and one by Dua Lipa.
    expect(searchTermFor({ title: 'Levitating', artist: 'Dua Lipa' })).toBe(
      'Levitating Dua Lipa',
    )
  })
})

describe('the Shortcut link', () => {
  it('runs the named shortcut with the song as its input', () => {
    const url = new URL(
      shortcutUrlFor({ title: 'Levitating', artist: 'Dua Lipa' }, 'Queue Song'),
    )

    expect(url.protocol).toBe('shortcuts:')
    // The x-callback form is what returns to this app afterwards, rather than
    // leaving the DJ sitting in Shortcuts.
    expect(url.pathname + url.host).toContain('run-shortcut')
    expect(url.searchParams.get('name')).toBe('Queue Song')
    expect(url.searchParams.get('input')).toBe('text')
    expect(url.searchParams.get('text')).toBe('Levitating Dua Lipa')
  })

  it('escapes a title that would otherwise break the URL', () => {
    const url = new URL(
      shortcutUrlFor({ title: 'Ain’t It Fun & Loud?', artist: 'A/B' }),
    )
    expect(url.searchParams.get('text')).toBe('Ain’t It Fun & Loud? A/B')
  })

  it('uses whatever the DJ named their shortcut', () => {
    setShortcutName('Party Queue')
    expect(getShortcutName()).toBe('Party Queue')
    expect(
      new URL(shortcutUrlFor({ title: 'A', artist: 'B' })).searchParams.get(
        'name',
      ),
    ).toBe('Party Queue')
  })

  it('falls back to the name the instructions give', () => {
    expect(getShortcutName()).toBe(DEFAULT_SHORTCUT_NAME)
    setShortcutName('   ')
    expect(getShortcutName()).toBe(DEFAULT_SHORTCUT_NAME)
  })
})

describe('where the button is offered', () => {
  it('is available on an iPhone', () => {
    pretendUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')
    expect(supportsShortcuts()).toBe(true)
  })

  it('is available on an iPad, which claims to be a Mac', () => {
    pretendUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)
    expect(supportsShortcuts()).toBe(true)
  })

  /** A control that could never do anything is worse than no control. */
  it('is not offered on a laptop, where Shortcuts cannot run', () => {
    pretendUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)
    expect(supportsShortcuts()).toBe(false)

    pretendUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(supportsShortcuts()).toBe(false)
  })

  it('needs both a capable device and the DJ having turned it on', () => {
    pretendUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')
    expect(isHandoffEnabled()).toBe(false)
    expect(canHandOff()).toBe(false)

    setHandoffEnabled(true)
    expect(canHandOff()).toBe(true)

    pretendUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(canHandOff()).toBe(false)
  })
})

describe('the no-setup fallback link', () => {
  it('uses the song’s own Apple Music page', () => {
    expect(appleMusicLinkFor(request())).toContain('music.apple.com')
  })

  it('is absent for a song that came from somewhere else', () => {
    expect(
      appleMusicLinkFor(
        request({ catalogUrl: 'https://www.deezer.com/track/1' }),
      ),
    ).toBeNull()
    expect(appleMusicLinkFor(request({ catalogUrl: null }))).toBeNull()
  })
})

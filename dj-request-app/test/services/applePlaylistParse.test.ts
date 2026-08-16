import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePlaylist,
  playlistUrl,
} from '../../supabase/functions/import-playlist/parse'

/**
 * Reading a real Apple Music playlist page.
 *
 * The fixture is a genuine page, trimmed to six tracks — not something written
 * to match the parser. Apple owes us no stability here, so the value of this
 * test is that it fails loudly the day the page changes shape, rather than the
 * import quietly returning nothing at a party.
 */

const fixture = readFileSync(
  join(process.cwd(), 'test', 'fixtures', 'apple-playlist.html'),
  'utf8',
)

describe('parsing a playlist page', () => {
  it('reads the name and every track, in order', () => {
    const playlist = parsePlaylist(fixture)

    expect(playlist).not.toBeNull()
    expect(playlist!.name).toBe('Today’s Hits')
    expect(playlist!.songIds).toEqual([
      '1817609509',
      '1820918468',
      '6763656878',
      '6792676860',
      '1889992115',
      '1844932150',
    ])
  })

  /**
   * Each track appears twice in the structured block — once as its own url and
   * once inside a listen action — and a playlist may genuinely repeat a song.
   * Neither should produce the same id twice.
   */
  it('does not repeat a song', () => {
    const ids = parsePlaylist(fixture)!.songIds
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('falls back to song links when the structured block is missing', () => {
    const stripped = fixture.replace(
      /<script[^>]+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/,
      '',
    )
    const withLinks =
      stripped +
      '<a href="https://music.apple.com/us/song/one/111111">a</a>' +
      '<a href="https://music.apple.com/us/song/two/222222">b</a>'

    const playlist = parsePlaylist(withLinks)
    expect(playlist!.songIds).toEqual(['111111', '222222'])
  })

  it('returns nothing for a page with no songs on it', () => {
    expect(parsePlaylist('<html><body>nope</body></html>')).toBeNull()
  })

  it('survives a malformed structured block', () => {
    const broken = fixture.replace(
      /<script([^>]+type="application\/ld\+json"[^>]*)>[\s\S]*?<\/script>/,
      '<script$1>{ not json </script>',
    )
    // No usable block and no links either — but it must not throw.
    expect(() => parsePlaylist(broken)).not.toThrow()
  })
})

/**
 * The allowlist is the entire defence against turning this into a service that
 * fetches whatever it is told to, from inside the hosting network.
 */
describe('which URLs we are willing to fetch', () => {
  it('accepts an Apple Music playlist link', () => {
    const url = playlistUrl(
      'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
    )
    expect(url?.hostname).toBe('music.apple.com')
  })

  it('accepts a personal playlist link', () => {
    expect(
      playlistUrl('https://music.apple.com/gb/playlist/friday/pl.u-abc123'),
    ).not.toBeNull()
  })

  it('strips tracking and session parameters', () => {
    const url = playlistUrl(
      'https://music.apple.com/us/playlist/x/pl.u-1?ls=1&at=affiliate&token=secret',
    )
    expect(url?.toString()).toBe('https://music.apple.com/us/playlist/x/pl.u-1')
  })

  it('refuses another host wearing a familiar path', () => {
    expect(playlistUrl('https://evil.test/us/playlist/pl.u-1')).toBeNull()
    expect(
      playlistUrl('https://music.apple.com.evil.test/us/playlist/pl.u-1'),
    ).toBeNull()
  })

  it('refuses anything that is not a playlist', () => {
    expect(playlistUrl('https://music.apple.com/us/album/x/123')).toBeNull()
    expect(playlistUrl('https://music.apple.com/')).toBeNull()
  })

  it('refuses the addresses that only a server can reach', () => {
    for (const bad of [
      'http://music.apple.com/us/playlist/x/pl.u-1',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'http://localhost:8000/playlist/',
    ]) {
      expect(playlistUrl(bad), bad).toBeNull()
    }
  })

  it('refuses rubbish', () => {
    expect(playlistUrl('')).toBeNull()
    expect(playlistUrl('not a url')).toBeNull()
    expect(playlistUrl(null)).toBeNull()
    expect(playlistUrl(42)).toBeNull()
  })
})

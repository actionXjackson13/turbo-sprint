import type { SongRequest } from '../../types/domain'

/**
 * Handing a song to the Apple Music app the DJ is already playing from.
 *
 * Playing songs *inside* this app would need MusicKit, which is licensed under
 * the Apple Developer Program — $99 a year on top of a subscription the DJ
 * already pays for, to play music they already have the right to play. This
 * sidesteps that entirely: rather than becoming a player, the app hands the
 * song across to the one on the phone.
 *
 * Two routes, because they do different jobs:
 *
 * - **A Shortcut** adds the song to Up Next, so whatever is playing keeps
 *   playing and the request lands behind it. This is the one that fits a
 *   party, and it is why Shortcuts is worth the one-time setup.
 * - **The catalogue link** opens the song's page in Apple Music. No setup at
 *   all, works on any device, but it takes over the screen rather than
 *   queueing, so it is the fallback.
 */

const ENABLED_KEY = 'soundboard.appleMusic.enabled'
const SHORTCUT_KEY = 'soundboard.appleMusic.shortcut'

/** What the setup instructions tell the DJ to call it. */
export const DEFAULT_SHORTCUT_NAME = 'Queue Song'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked. The setting simply will not survive a reload.
  }
}

/**
 * Per device rather than per event: the Shortcut lives on the DJ's phone, so
 * whether it exists is a fact about the phone, not about the party.
 */
export function isHandoffEnabled(): boolean {
  return read(ENABLED_KEY) === 'true'
}

export function setHandoffEnabled(enabled: boolean): void {
  write(ENABLED_KEY, String(enabled))
}

export function getShortcutName(): string {
  const stored = read(SHORTCUT_KEY)?.trim()
  return stored && stored.length > 0 ? stored : DEFAULT_SHORTCUT_NAME
}

export function setShortcutName(name: string): void {
  write(SHORTCUT_KEY, name.trim())
}

/**
 * What the Shortcut is given to search for.
 *
 * Title and artist together, because a title alone finds covers — Apple Music
 * has a dozen "Levitating"s and only one by Dua Lipa.
 */
export function searchTermFor(song: { title: string; artist: string }): string {
  return `${song.title} ${song.artist}`.trim()
}

/**
 * The link that runs the DJ's Shortcut with this song.
 *
 * `x-callback-url` rather than the plain `run-shortcut` form: it is the
 * variant that returns to the calling app afterwards, so the DJ lands back on
 * the queue instead of being left in Shortcuts.
 */
export function shortcutUrlFor(
  song: { title: string; artist: string },
  shortcutName = getShortcutName(),
): string {
  const params = new URLSearchParams({
    name: shortcutName,
    input: 'text',
    text: searchTermFor(song),
  })
  return `shortcuts://x-callback-url/run-shortcut?${params}`
}

/**
 * Whether a Shortcut can run here at all.
 *
 * Shortcuts is an Apple platform feature, so the button is pointless anywhere
 * else — offering it on a laptop would be a control that silently does
 * nothing. iPadOS reports itself as a Mac with touch, hence the second test.
 */
export function supportsShortcuts(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return iOS || iPadOS
}

/** True when the DJ has set this up and it can actually run. */
export function canHandOff(): boolean {
  return isHandoffEnabled() && supportsShortcuts()
}

/**
 * Send the song across.
 *
 * `location.href` rather than `window.open`: a custom scheme opened in a new
 * tab leaves an empty tab behind on iOS Safari, and the app is coming straight
 * back anyway.
 */
export function handOffToAppleMusic(song: {
  title: string
  artist: string
}): void {
  window.location.href = shortcutUrlFor(song)
}

/** The song's own page in Apple Music, when the catalogue gave us one. */
export function appleMusicLinkFor(request: SongRequest): string | null {
  return request.catalogUrl?.includes('music.apple.com')
    ? request.catalogUrl
    : null
}

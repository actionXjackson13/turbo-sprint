import type { SongRequest } from '../../types/domain'

/**
 * Opening a requested song in Apple Music.
 *
 * This used to drive a Shortcut, on the assumption that Shortcuts could search
 * Apple Music and add the result to Up Next. It cannot. Apple ships no action
 * that searches the streaming catalogue — `Find Music` reaches only what is
 * already saved to the library — so the instructions described a shortcut that
 * could not be built. Automatic queueing into Apple Music needs a third-party
 * bridge (Toolbox Pro) and is therefore not free, which is the whole reason
 * in-app playback went to YouTube instead. See services/player/.
 *
 * What is left is the part that genuinely works everywhere and costs nothing: a
 * link that opens Apple Music with the song searched for, ready to play. Two
 * taps rather than none — but no setup, no purchase, no key, and it plays from
 * the subscription the DJ already has, at full quality and with no adverts.
 * That is worth keeping beside a YouTube player, not instead of it.
 */

const ENABLED_KEY = 'soundboard.appleMusic.enabled'

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
 * Per device rather than per event: whether the DJ wants to be thrown into
 * Apple Music is a fact about how they run a night, not about the party.
 */
export function isHandoffEnabled(): boolean {
  return read(ENABLED_KEY) === 'true'
}

export function setHandoffEnabled(enabled: boolean): void {
  write(ENABLED_KEY, String(enabled))
}

/**
 * What Apple Music is asked to find.
 *
 * Title and artist together, because a title alone finds covers — Apple Music
 * has a dozen "Levitating"s and only one by Dua Lipa.
 */
export function searchTermFor(song: { title: string; artist: string }): string {
  return `${song.title} ${song.artist}`.trim()
}

/**
 * A search inside Apple Music for this song.
 *
 * The https form rather than the `music://` scheme: iOS treats it as a
 * universal link and opens the app anyway, while on a laptop it degrades to the
 * web player instead of failing at a scheme nothing has registered.
 */
export function appleMusicSearchUrl(song: {
  title: string
  artist: string
}): string {
  return `https://music.apple.com/search?term=${encodeURIComponent(
    searchTermFor(song),
  )}`
}

/**
 * True when the DJ has asked for this. There is no device test any more —
 * unlike a Shortcut, an Apple Music link resolves on every platform.
 */
export function canHandOff(): boolean {
  return isHandoffEnabled()
}

/** Send the DJ to Apple Music with the song searched for. */
export function handOffToAppleMusic(song: {
  title: string
  artist: string
}): void {
  window.location.href = appleMusicSearchUrl(song)
}

/**
 * The song's own page in Apple Music, when the catalogue gave us one.
 *
 * Better than a search when it exists — it lands on the exact recording rather
 * than a list — but only songs found through Apple's own catalogue carry one.
 */
export function appleMusicLinkFor(request: SongRequest): string | null {
  return request.catalogUrl?.includes('music.apple.com')
    ? request.catalogUrl
    : appleMusicSearchUrl(request)
}

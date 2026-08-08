/**
 * Where the YouTube key lives, and why it lives there.
 *
 * Playback needs no key. Only the song *lookup* does, and that key is the one
 * piece of this feature the app cannot supply for everybody: a key shipped in
 * the bundle is readable by anyone who loads the page, and its hundred daily
 * lookups would be shared by every party running the app at once — the first
 * busy Saturday would exhaust it for everyone else.
 *
 * So the DJ brings their own. It is free from Google, needs no card, and lives
 * in this device's storage rather than in the event: it belongs to the person
 * running the music, not to the party, and it must never travel to a guest.
 *
 * A build-time key is honoured as a fallback so a private deployment can set
 * one and never see the setup screen.
 */

const KEY = 'soundboard.player.youtubeKey'

const buildTimeKey =
  import.meta.env.VITE_YOUTUBE_API_KEY?.trim() ?? ''

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** The key to search with, or '' when the DJ has not set one up yet. */
export function getYouTubeKey(): string {
  return read()?.trim() || buildTimeKey
}

export function setYouTubeKey(value: string): void {
  try {
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(KEY, trimmed)
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked. The key simply will not survive a reload.
  }
}

/** Whether in-app playback can even be attempted on this device. */
export function hasYouTubeKey(): boolean {
  return getYouTubeKey() !== ''
}

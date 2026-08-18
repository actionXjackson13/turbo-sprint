/**
 * Whether the app is the thing playing the music.
 *
 * Until now it assumed it was, and that assumption is wrong for most working
 * DJs: they arrive with rekordbox, a controller and their own library, and want
 * the app for what the app is actually good at — taking requests from the room
 * and telling the room what is on. The player is still there, still the
 * default, and still the right answer for a phone plugged into a speaker. It is
 * just no longer compulsory.
 *
 * Device-local, like the YouTube key next door in `playerSettings.ts`, and for
 * the same reason: this describes the rig in front of one person, not the
 * party. The DJ's laptop runs their own decks; a second phone they hand to a
 * friend does not, and neither belongs in the event row where a guest could
 * read it.
 *
 * Changes have to reach screens that are already mounted — the player bar lives
 * above the router and would otherwise sit there until a reload — so this is a
 * store with subscribers rather than a bare getter.
 */

export type PlaybackMode = 'in-app' | 'my-own-decks'

const KEY = 'soundboard.player.mode'

/** In-app, unless this device has said otherwise. Nobody is opted in blind. */
const DEFAULT: PlaybackMode = 'in-app'

const listeners = new Set<() => void>()

/**
 * Cached rather than read on every call.
 *
 * `useSyncExternalStore` calls its snapshot on each render and compares by
 * identity, so a getter that touched storage every time would be both wasteful
 * and — if storage ever threw mid-session — a source of flapping values.
 */
let current: PlaybackMode | null = null

function read(): PlaybackMode {
  try {
    return localStorage.getItem(KEY) === 'my-own-decks'
      ? 'my-own-decks'
      : DEFAULT
  } catch {
    // Private browsing, or storage denied. In-app is the safe reading: it is
    // what the app has always done.
    return DEFAULT
  }
}

export function getPlaybackMode(): PlaybackMode {
  if (current === null) current = read()
  return current
}

export function setPlaybackMode(mode: PlaybackMode): void {
  if (getPlaybackMode() === mode) return
  current = mode

  try {
    if (mode === DEFAULT) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch {
    // The choice still holds for this session; it just will not survive a
    // reload. Better than refusing to switch at all mid-party.
  }

  for (const listener of listeners) listener()
}

export function subscribePlaybackMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The question every screen actually asks: is the app playing this, or not? */
export function isOwnDecks(): boolean {
  return getPlaybackMode() === 'my-own-decks'
}

/** Test seam. Storage and subscribers both survive a reset; the cache does not. */
export function __resetPlaybackMode(): void {
  current = null
  listeners.clear()
}

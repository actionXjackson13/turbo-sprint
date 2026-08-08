import { songMatchKey } from '../../utils/normalizeText'
import type { VideoMatch } from './youtubeSearch'

/**
 * The lookup a song only ever pays for once.
 *
 * YouTube's free tier allows roughly a hundred searches a day, and that is the
 * whole reason this file exists. Without it the app would re-buy the same
 * answer every time a song was played, and a party that runs "Mr. Brightside"
 * twice would pay twice for a fact that has not changed since 2004. With it,
 * the budget is only ever spent on songs this device has genuinely never seen,
 * and a DJ's regulars become free after the first night.
 *
 * The whole ranked candidate list is stored rather than just the chosen video.
 * That is what lets "wrong song" step to the next-best pick for nothing — the
 * alternatives were in the response the app already paid for, so throwing them
 * away would mean buying them again.
 *
 * Keyed by the same normalisation the duplicate-request check uses, so
 * "Don't Stop Me Now" and "Dont Stop Me Now" are one entry rather than two.
 */

const STORAGE_KEY = 'soundboard.player.videos'

/**
 * How many songs to remember. Generous — the entries are small, and the point
 * of the cache is defeated by forgetting. Old entries are dropped only to stay
 * clear of the storage ceiling, which a browser enforces by throwing on write.
 */
const LIMIT = 200

export interface CachedResolution {
  /** Ranked best-first, as they were scored when first fetched. */
  candidates: VideoMatch[]
  /** Which candidate is in use. Advanced by the DJ rejecting a pick. */
  index: number
}

type CacheShape = Record<string, CachedResolution>

export function cacheKeyFor(song: { title: string; artist: string }): string {
  return songMatchKey(song.title, song.artist)
}

function readAll(): CacheShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // Anything could be in storage — another version of this app, a half-written
    // value, a user poking at devtools. A bad cache must not take the party down.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as CacheShape
  } catch {
    return {}
  }
}

function writeAll(cache: CacheShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Full or blocked. Losing the cache costs quota, not correctness.
  }
}

/** The stored resolution for a song, or null if it has never been looked up. */
export function readCachedResolution(song: {
  title: string
  artist: string
}): CachedResolution | null {
  const entry = readAll()[cacheKeyFor(song)]
  if (!entry || !Array.isArray(entry.candidates) || entry.candidates.length === 0) {
    return null
  }
  return entry
}

/** The video currently chosen for a song, honouring any rejections. */
export function readCachedMatch(song: {
  title: string
  artist: string
}): VideoMatch | null {
  const entry = readCachedResolution(song)
  return entry?.candidates[entry.index] ?? null
}

export function writeCachedResolution(
  song: { title: string; artist: string },
  resolution: CachedResolution,
): void {
  const cache = readAll()
  const key = cacheKeyFor(song)

  // Re-inserting moves the key to the end, so a song in active use is the last
  // thing to be evicted rather than the first.
  delete cache[key]
  cache[key] = resolution

  // Object keys keep insertion order, so the oldest are simply the first ones.
  const keys = Object.keys(cache)
  for (const stale of keys.slice(0, Math.max(0, keys.length - LIMIT))) {
    delete cache[stale]
  }

  writeAll(cache)
}

/**
 * Reject the current pick and move to the next-best candidate.
 *
 * Returns the new pick, or null when the list is exhausted — at which point the
 * honest answer is that YouTube's top ten did not contain the song, and the DJ
 * should skip it rather than have the app spend more quota guessing.
 */
export function rejectCachedMatch(song: {
  title: string
  artist: string
}): VideoMatch | null {
  const entry = readCachedResolution(song)
  if (!entry) return null

  const next = entry.index + 1
  if (next >= entry.candidates.length) return null

  writeCachedResolution(song, { ...entry, index: next })
  return entry.candidates[next] ?? null
}

/** Testing seam, and the "start over" behind the settings screen. */
export function clearVideoCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; a cache that cannot be cleared is still only a cache.
  }
}

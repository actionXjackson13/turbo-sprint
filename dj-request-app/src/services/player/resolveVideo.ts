import { getYouTubeKey } from './playerSettings'
import {
  readCachedMatch,
  rejectCachedMatch,
  writeCachedResolution,
} from './videoCache'
import {
  PlayerError,
  playerFailureMessage,
  searchYouTube,
  type VideoMatch,
} from './youtubeSearch'

/**
 * Song in, video out — the one entry point the player screen uses.
 *
 * The cache is consulted before the key is, deliberately. A DJ whose key has
 * been removed, or whose daily lookups are spent, can still play every song the
 * device already knows; the feature degrades to "the songs you've played before"
 * rather than falling over completely, which is a considerably better thing to
 * happen halfway through a set.
 */
export async function resolveVideo(
  song: { title: string; artist: string },
  opts?: { signal?: AbortSignal },
): Promise<VideoMatch> {
  const cached = readCachedMatch(song)
  if (cached) return cached

  const key = getYouTubeKey()
  if (!key) {
    throw new PlayerError('no_key', playerFailureMessage('no_key'))
  }

  const candidates = await searchYouTube(song, key, opts)
  writeCachedResolution(song, { candidates, index: 0 })
  // `searchYouTube` throws rather than returning an empty list, so there is
  // always a first candidate — but the type does not know that.
  const best = candidates[0]
  if (!best) {
    throw new PlayerError('not_found', playerFailureMessage('not_found'))
  }
  return best
}

/**
 * "That's the wrong song."
 *
 * Steps to the next-best candidate from the search already paid for, so
 * correcting a bad pick costs nothing. Null means the alternatives are used up.
 */
export function rejectVideo(song: {
  title: string
  artist: string
}): VideoMatch | null {
  return rejectCachedMatch(song)
}

import { songMatchKey } from '../../utils/normalizeText'
import type { SongRequest } from '../../types/domain'

/**
 * Not playing the same song twice in one night.
 *
 * A guest asking for something already asked for is handled where they ask —
 * `findSimilarRequest` offers them the existing entry to upvote instead. The
 * DJ's own paths had no equivalent, and two of them make it easy: loading the
 * same set a second time duplicates every song in it, and adding a track by
 * hand that is already waiting duplicates that.
 *
 * Exact normalised matches only, deliberately. The guest-facing check is fuzzy
 * because a guest is typing from memory and a near-miss is probably the same
 * song; these songs came from a catalogue or from the DJ's own set, so a
 * near-miss is far more likely to be a genuinely different recording — a remix,
 * a live cut — and silently dropping one of those would be worse than the
 * duplicate it prevented.
 */

/** Songs still to come, or already played tonight. Declined ones don't count. */
export function playedOrPendingKeys(requests: SongRequest[]): Set<string> {
  return new Set(
    requests
      .filter((r) => r.status !== 'declined')
      .map((r) => songMatchKey(r.title, r.artist)),
  )
}

export function isAlreadyIn(
  keys: Set<string>,
  song: { title: string; artist: string },
): boolean {
  return keys.has(songMatchKey(song.title, song.artist))
}

/**
 * Split a batch into what is new and what the night already has.
 *
 * Returns both, because the DJ needs to be told what was skipped — a set of
 * twenty that quietly adds three is alarming if you cannot see why.
 */
export function partitionNew<T extends { title: string; artist: string }>(
  songs: T[],
  existing: SongRequest[],
): { fresh: T[]; duplicates: T[] } {
  const keys = playedOrPendingKeys(existing)
  const fresh: T[] = []
  const duplicates: T[] = []

  for (const song of songs) {
    const key = songMatchKey(song.title, song.artist)
    // Counted as it goes, so a set containing the same song twice does not
    // sneak a duplicate past a check that only looked at what was already here.
    if (keys.has(key)) {
      duplicates.push(song)
    } else {
      keys.add(key)
      fresh.push(song)
    }
  }

  return { fresh, duplicates }
}

/** "Nothing new — all 12 are already on tonight." and similar. */
export function skippedMessage(added: number, skipped: number): string | null {
  if (skipped === 0) return null
  const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`
  if (added === 0) return `Already on tonight — ${songs(skipped)} skipped.`
  return `Added ${songs(added)}. Skipped ${skipped} already on tonight.`
}

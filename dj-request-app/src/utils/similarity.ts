/**
 * Trigram similarity, mirroring PostgreSQL's `pg_trgm`.
 *
 * Duplicate detection runs in two places: against Postgres it is
 * `similarity()` from pg_trgm; in demo mode there is no database, so this is
 * the stand-in. Reimplementing pg_trgm's exact algorithm — rather than reaching
 * for an easier metric like Levenshtein — is what keeps the two backends
 * agreeing on which requests count as the same song.
 *
 * pg_trgm's algorithm: split into words, pad each word with two leading and one
 * trailing space, take the set of 3-character substrings, then compare the two
 * sets as |intersection| / |union| (the Jaccard index).
 *
 * Input is expected to be normalised already (see normalizeSongText).
 */

/**
 * Minimum similarity for two requests to be treated as the same song.
 *
 * Picked from measurement rather than taste. Across a set of realistic pairs,
 * genuine duplicates ("Blinding Lights"/"The Weeknd" vs "Blinding Light"/"The
 * Weekend", the worst true case) scored no lower than 0.74, while distinct
 * songs ("Yesterday" vs "Let It Be", both by The Beatles, the worst false
 * case) scored no higher than 0.40. 0.55 sits in that gap with room either
 * side, so neither class has to be right at the boundary.
 *
 * Must stay in step with the threshold in migration 0005. The nudge it drives
 * is advisory — a guest can always submit anyway — so a false positive costs
 * one extra tap, while a false negative silently splits the vote for a song
 * across two entries.
 */
export const SIMILAR_REQUEST_THRESHOLD = 0.55

/** The set of padded 3-grams for an already-normalised string. */
export function trigrams(text: string): Set<string> {
  const result = new Set<string>()
  for (const word of text.split(' ')) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) {
      result.add(padded.slice(i, i + 3))
    }
  }
  return result
}

/** Jaccard index of two trigram sets, in [0, 1]. */
export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a)
  const right = trigrams(b)

  if (left.size === 0 || right.size === 0) {
    // Two empty strings are trivially identical; one empty is not a match.
    return left.size === right.size ? 1 : 0
  }

  let intersection = 0
  for (const gram of left) {
    if (right.has(gram)) intersection += 1
  }

  const union = left.size + right.size - intersection
  return union === 0 ? 0 : intersection / union
}

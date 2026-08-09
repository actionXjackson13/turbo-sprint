import { normalizeSongText } from '../../utils/normalizeText'

/**
 * Songs the DJ never plays.
 *
 * This is what makes auto accept safe to leave on. Without it, turning that
 * switch on means agreeing to everything in advance — including the one song
 * this DJ will not play at a wedding, and the running joke someone in the room
 * has decided to request eleven times.
 *
 * Matched loosely on purpose, and in the opposite direction to the duplicate
 * check: a blocklist entry is something the DJ typed as a rule rather than
 * picked from a catalogue, so "Baby Shark" should catch every upload of it, and
 * blocking an artist should catch their whole discography. A near-miss here
 * costs one declined request, which the DJ can reverse; a miss costs the thing
 * they were trying to avoid.
 *
 * Stored per device, like the YouTube key and auto accept, and for the same
 * reason: it is enforced by the DJ's own app as requests arrive, so it
 * describes what this phone does rather than a fact about the party.
 */

const KEY = 'soundboard.blocklist'

export interface BlockedSong {
  /** As the DJ typed it, for showing back to them. */
  text: string
  /** What matching actually compares against. */
  key: string
}

function read(): BlockedSong[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is BlockedSong =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as BlockedSong).text === 'string' &&
        typeof (e as BlockedSong).key === 'string',
    )
  } catch {
    return []
  }
}

function write(entries: BlockedSong[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Storage blocked. The list holds for this page view only.
  }
}

export function listBlocked(): BlockedSong[] {
  return read()
}

export function addBlocked(text: string): BlockedSong[] {
  const trimmed = text.trim()
  const key = normalizeSongText(trimmed)
  if (!key) return read()

  const entries = read().filter((e) => e.key !== key)
  entries.unshift({ text: trimmed, key })
  write(entries)
  return entries
}

export function removeBlocked(key: string): BlockedSong[] {
  const entries = read().filter((e) => e.key !== key)
  write(entries)
  return entries
}

/**
 * Whether a song is blocked, matching a term anywhere in its title or artist.
 *
 * Substring rather than equality so one entry can stand for a whole artist, or
 * for a title however it has been decorated — "(Radio Edit)", "- Remastered
 * 2011", a feature credit. Those decorations are exactly what an exact match
 * would trip over.
 */
export function isBlocked(
  song: { title: string; artist: string },
  entries: BlockedSong[] = read(),
): BlockedSong | null {
  if (entries.length === 0) return null
  const haystack = `${normalizeSongText(song.title)} ${normalizeSongText(
    song.artist,
  )}`
  return entries.find((entry) => haystack.includes(entry.key)) ?? null
}

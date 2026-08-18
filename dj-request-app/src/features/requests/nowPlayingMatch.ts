import { songMatchKey } from '../../utils/normalizeText'
import type { SongRequest } from '../../types/domain'

/**
 * Tying "what I just put on" back to "what somebody asked for".
 *
 * A DJ on their own decks names the song that is playing, and most of the time
 * that song is theirs — but sometimes it is the request sitting third in the
 * queue, played out of order because it fitted. Those two have to be the same
 * event: `setNowPlaying` retires the request it is given, so finding the match
 * is what keeps the queue honest and stops the guest who asked being told their
 * song is still waiting while it is audibly playing.
 *
 * Catalogue id first, because it is an identity rather than a guess — the same
 * id means the same recording, remix and edit included. The normalised
 * title/artist key is the fallback for songs typed by hand or picked from a
 * catalogue the request did not come from.
 *
 * Exact normalised matching, not fuzzy, for the reason spelled out in
 * `duplicates.ts`: a near miss here is more likely a different recording than
 * the same one, and wrongly retiring a request marks somebody's song played
 * when it never was.
 */
export function findQueuedMatch(
  queue: SongRequest[],
  song: { id?: string | null; title: string; artist: string },
): SongRequest | null {
  if (song.id) {
    const byId = queue.find((request) => request.catalogId === song.id)
    if (byId) return byId
  }

  const key = songMatchKey(song.title, song.artist)
  return queue.find((request) => songMatchKey(request.title, request.artist) === key) ?? null
}

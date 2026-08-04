import type { CatalogSong } from './appleCatalog'
import { songMatchKey } from '../../utils/normalizeText'
import { jsonp } from './jsonp'

/**
 * Song lookup against Deezer, for when Apple will not answer this phone.
 *
 * Chosen over Spotify, which was the obvious first thought and does not work
 * here. Spotify's search needs a bearer token; the app-only token needs a
 * client secret, which cannot live in a static site — anything shipped in the
 * bundle is readable by everyone who loads the page — and the browser-safe
 * alternative makes every guest sign in with their own Spotify account before
 * they can ask for a song. Neither survives contact with a party. Deezer needs
 * no account, no key and no server of ours.
 *
 * It sends no CORS headers at all, so it is fetched as a script — see jsonp.ts.
 * That is a virtue rather than a workaround: the reason Apple keeps failing on
 * this phone is CORS, and this path does not involve it.
 *
 * The catalogue is genuinely weaker than Apple's, which is why this sits below
 * it: some recordings are missing outright, and its ranking will put a cover
 * above the original. Better than MusicBrainz, though, which is why it sits
 * above that — Deezer has artwork, and artwork is most of what makes a result
 * list readable at a party.
 */

interface DeezerTrack {
  id?: number
  title?: string
  link?: string
  /** Deezer's own popularity score. The only ordering signal on offer. */
  rank?: number
  artist?: { name?: string }
  album?: { title?: string; cover_medium?: string; cover_big?: string }
}

const ENDPOINT = 'https://api.deezer.com/search'

export async function searchDeezer(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  const query = term.trim()
  if (!query) return []

  const body = await jsonp<{ data?: DeezerTrack[] }>(
    ENDPOINT,
    {
      q: query,
      // Over-fetch: the same song appears once per release and per remix, and
      // collapsing those below leaves far fewer than were asked for.
      limit: '40',
    },
    {
      // Deezer needs telling that a callback is wanted, not just given one.
      extraParams: { output: 'jsonp' },
      signal: opts?.signal,
    },
  )

  /**
   * Collapse the same song-and-artist, keeping the most popular of them.
   *
   * A hit comes back many times over — the single, the album, a deluxe
   * reissue, a live take — and a list of near-identical rows is worse than a
   * short one when the guest is choosing at a party.
   */
  const best = new Map<string, { song: CatalogSong; rank: number }>()

  for (const track of body.data ?? []) {
    const title = track.title?.trim()
    const artist = track.artist?.name?.trim()
    if (!track.id || !title || !artist) continue

    const key = songMatchKey(title, artist)
    const rank = track.rank ?? 0
    const existing = best.get(key)
    if (existing && existing.rank >= rank) continue

    best.set(key, {
      rank,
      song: {
        id: `dz:${track.id}`,
        title,
        artist,
        album: track.album?.title?.trim() ?? '',
        artworkUrl: track.album?.cover_big ?? track.album?.cover_medium ?? null,
        // Deezer's own page for the track, not an Apple Music one. The DJ
        // still gets an exact title and artist, which is the job.
        catalogUrl: track.link ?? null,
      },
    })
  }

  return [...best.values()]
    .sort((a, b) => b.rank - a.rank)
    .slice(0, opts?.limit ?? 20)
    .map((entry) => entry.song)
}

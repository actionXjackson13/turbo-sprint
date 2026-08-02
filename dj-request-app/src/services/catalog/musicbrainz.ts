import { ServiceError } from '../types'
import type { CatalogSong } from './appleCatalog'
import { songMatchKey } from '../../utils/normalizeText'

/**
 * Fallback song lookup, for guests who cannot reach Apple's catalogue.
 *
 * `itunes.apple.com` sits on several ad-blocker lists — not because song
 * search is tracking anyone, but because Apple serves other things from that
 * host. A guest running AdGuard, Brave, or a filtering DNS gets the request
 * killed before it leaves the phone, and no amount of app code changes that.
 *
 * MusicBrainz is an open music database run by a non-profit. It carries no
 * ads and no tracking, so it is on nobody's blocklist, and it sends
 * `access-control-allow-origin: *`. The trade-off is real: no artwork, no
 * Apple Music link, and ranking that surfaces obscure covers alongside the
 * recording everyone means. Good enough to name a song correctly, which is the
 * job — so it is the second choice, not the first.
 */

interface MbArtistCredit {
  name?: string
}

interface MbRelease {
  title?: string
}

interface MbRecording {
  id?: string
  title?: string
  'artist-credit'?: MbArtistCredit[]
  releases?: MbRelease[]
}

const ENDPOINT = 'https://musicbrainz.org/ws/2/recording'

export async function searchMusicBrainz(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  const query = term.trim()
  if (!query) return []

  const url = `${ENDPOINT}?${new URLSearchParams({
    query,
    fmt: 'json',
    // Over-fetch: the same recording appears once per release, and collapsing
    // those below leaves far fewer than were asked for.
    limit: '40',
  })}`

  let response: Response
  try {
    response = await fetch(url, { signal: opts?.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ServiceError('network', 'Could not reach song search.')
  }

  if (!response.ok) {
    throw new ServiceError('network', 'Song search is unavailable right now.')
  }

  const body = (await response.json()) as { recordings?: MbRecording[] }

  /**
   * Collapse the same song-and-artist into one entry, and count how many
   * releases it appeared across.
   *
   * MusicBrainz scores nearly every title match 100, so its own ordering puts
   * a university a-cappella cover above the recording everyone means. Release
   * count is the usable signal in the response: a hit is reissued endlessly on
   * compilations, a cover appears once. For "Mr. Brightside" that is 17
   * releases for The Killers against 1 for the covers above them.
   */
  const merged = new Map<string, { song: CatalogSong; releases: number }>()

  for (const rec of body.recordings ?? []) {
    const title = rec.title?.trim()
    const artist = rec['artist-credit']?.[0]?.name?.trim()
    if (!rec.id || !title || !artist) continue

    const key = songMatchKey(title, artist)
    const releases = rec.releases?.length ?? 0
    const existing = merged.get(key)

    if (existing) {
      existing.releases += releases
      continue
    }

    merged.set(key, {
      releases,
      song: {
        id: `mb:${rec.id}`,
        title,
        artist,
        album: rec.releases?.[0]?.title?.trim() ?? '',
        artworkUrl: null,
        catalogUrl: null,
      },
    })
  }

  const songs = [...merged.values()]
    .sort((a, b) => b.releases - a.releases)
    .slice(0, opts?.limit ?? 20)
    .map((entry) => entry.song)

  return songs
}

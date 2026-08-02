import { ServiceError } from '../types'
import { searchMusicBrainz } from './musicbrainz'

/**
 * Song lookup against Apple's public catalogue.
 *
 * Uses the iTunes Search API rather than the Apple Music API: it needs no
 * developer account, no key, no signed token and no server of our own, and it
 * sends permissive CORS headers so the browser can call it directly. The
 * trade-off is that it returns catalogue metadata only — enough to identify a
 * song exactly, which is all this app needs. Playback stays with whatever the
 * DJ already uses.
 *
 * Rate limiting is per IP and undocumented, commonly reported around 20
 * requests a minute. A whole party shares one WiFi address, so callers must
 * debounce — see useCatalogSearch.
 */

export interface CatalogSong {
  /** Apple's track id, stable across searches. */
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  /** Opens the track in Apple Music. */
  catalogUrl: string | null
}

interface ItunesResult {
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  trackViewUrl?: string
}

const ENDPOINT = 'https://itunes.apple.com/search'

/** The 100px thumbnail the API returns is soft on a modern phone. */
function upscaleArtwork(url: string | undefined): string | null {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\./, '/300x300bb.')
}

/**
 * Search Apple, and fall back to MusicBrainz if Apple cannot be reached.
 *
 * The fallback exists because `itunes.apple.com` is on ad-blocker lists, so a
 * guest running one gets nothing at all — see musicbrainz.ts. It is only ever
 * reached when the first attempt fails, so the better results stay the
 * default.
 */
export async function searchCatalog(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  try {
    return await searchApple(term, opts)
  } catch (err) {
    // An abort is the caller superseding this search, not a failure to reach
    // anything — retrying elsewhere would race the newer search.
    if (err instanceof DOMException && err.name === 'AbortError') throw err

    try {
      return await searchMusicBrainz(term, opts)
    } catch (fallbackErr) {
      if (fallbackErr instanceof DOMException) throw fallbackErr
      // Report the first failure: it is the one describing the usual cause.
      throw err
    }
  }
}

async function searchApple(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  const query = term.trim()
  if (!query) return []

  const url = `${ENDPOINT}?${new URLSearchParams({
    term: query,
    media: 'music',
    entity: 'song',
    limit: String(opts?.limit ?? 20),
  })}`

  let response: Response
  try {
    response = await fetch(url, { signal: opts?.signal })
  } catch (err) {
    // An aborted request is the caller superseding it, not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ServiceError(
      'network',
      'Could not reach song search. Check your connection, or type the song in below.',
    )
  }

  if (response.status === 403 || response.status === 429) {
    throw new ServiceError(
      'network',
      'Too many searches at once. Wait a moment and try again.',
    )
  }
  if (!response.ok) {
    throw new ServiceError(
      'network',
      'Song search is unavailable right now. You can type the song in below.',
    )
  }

  const body = (await response.json()) as { results?: ItunesResult[] }

  return (body.results ?? [])
    .filter((r) => r.trackId && r.trackName && r.artistName)
    .map((r) => ({
      id: String(r.trackId),
      title: r.trackName!,
      artist: r.artistName!,
      album: r.collectionName ?? '',
      artworkUrl: upscaleArtwork(r.artworkUrl100),
      catalogUrl: r.trackViewUrl ?? null,
    }))
}

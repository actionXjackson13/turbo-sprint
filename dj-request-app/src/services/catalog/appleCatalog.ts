import { ServiceError } from '../types'
import { searchMusicBrainz } from './musicbrainz'
import { searchAppleJsonp } from './appleJsonp'
import { searchDeezer } from './deezer'

/**
 * Song lookup against Apple's public catalogue.
 *
 * Uses the iTunes Search API rather than the Apple Music API: it needs no
 * developer account, no key, no signed token and no server of our own. The
 * trade-off is that it returns catalogue metadata only — enough to identify a
 * song exactly, which is all this app needs. Playback stays with whatever the
 * DJ already uses.
 *
 * The browser calls Apple directly. Apple answers a request carrying an
 * `Origin` header with a matching `access-control-allow-origin`, so this needs
 * no proxy of our own — and must not have one. Every request Apple rejects is
 * rejected on the *caller's* IP, and hosted proxies share their egress
 * addresses with everybody else on the platform: a Cloudflare Worker gets a
 * flat `429 Rate limit has been exceeded` on every call, first one included.
 * The guest's own phone is the only address with budget left, so it is the one
 * that has to ask.
 *
 * That budget is small — per IP, undocumented, and a party shares the venue's
 * one WiFi address. Rationing it is the caller's job: see useCatalogSearch,
 * which debounces, sets a floor on query length, and caches.
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

export interface ItunesResult {
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  trackViewUrl?: string
}

const ENDPOINT = 'https://itunes.apple.com/search'

/**
 * How long to wait before treating a request as failed.
 *
 * `fetch` has no timeout of its own: a request that is never answered — a
 * captive portal swallowing it, a filtering DNS blackholing the host, a phone
 * that has technically-but-not-really got signal — stays pending forever, and
 * the promise chain behind it never runs. That is worse than an error. The
 * search sat on its loading skeletons indefinitely, never reached the
 * fallback, and never told the guest anything, so the only thing that ever
 * worked was typing the song in by hand.
 */
const TIMEOUT_MS = 7_000

/**
 * A signal that trips on the caller's abort *or* after `ms`.
 *
 * Hand-rolled rather than `AbortSignal.any` + `AbortSignal.timeout`, which
 * together need Safari 17.4 — too new to require of a guest's phone at a
 * party, which is the one device this has to work on.
 */
export interface TimeoutGuard {
  signal: AbortSignal
  /**
   * True when *we* gave up rather than the caller.
   *
   * Both arrive as the same AbortError, and the two mean opposite things: a
   * caller abort means a newer search has superseded this one and nothing more
   * should happen, while our own timeout means this source is not answering
   * and the fallback should be tried. Guessing from the signal is unreliable —
   * a caller need not pass one at all — so it is recorded instead.
   */
  timedOut: boolean
  done: () => void
}

export function withTimeout(
  signal: AbortSignal | undefined,
  ms: number,
): TimeoutGuard {
  const controller = new AbortController()
  const guard: TimeoutGuard = {
    signal: controller.signal,
    timedOut: false,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }

  const timer = setTimeout(() => {
    guard.timedOut = true
    controller.abort()
  }, ms)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  return guard
}

/** Which catalogue actually answered, so the UI can be honest about it. */
export type CatalogSource = 'apple' | 'deezer' | 'musicbrainz'

/**
 * Why Apple was not the one that answered.
 *
 * Worth separating because the remedies have nothing in common. A blocked host
 * is the guest's own device refusing, and only they can allow it. A refusal is
 * the venue's shared address being rate-limited, and waiting fixes it. Told
 * "could not be reached", someone will check their WiFi — which is the one
 * thing that is definitely fine.
 */
export type AppleFailure = 'offline' | 'blocked' | 'refused' | 'slow'

export interface CatalogResults {
  songs: CatalogSong[]
  source: CatalogSource
  /** Set only when `source` is not `apple`. */
  appleFailure?: AppleFailure
}

/** Tiny, on the same host, and not part of the search rate limit. */
const PROBE_URL = 'https://itunes.apple.com/robots.txt'
const PROBE_TIMEOUT_MS = 4_000

/**
 * Work out *why* Apple did not answer, from the guest's own phone.
 *
 * A cross-origin request that fails tells the page almost nothing: the browser
 * reports the same opaque error whether an extension killed it, DNS refused to
 * resolve it, or Apple returned a `429` without the CORS headers needed to let
 * us read it. Those are different problems with different fixes, and guessing
 * between them from a datacentre is hopeless — the only machine that can tell
 * is the one being blocked.
 *
 * `no-cors` is what makes this possible. The browser stops enforcing CORS and
 * hands back an opaque response, so the request succeeding proves the host is
 * reachable and something about the *search* was refused; it failing proves
 * the request never got out of the phone at all.
 */
async function probeApple(signal?: AbortSignal): Promise<AppleFailure> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline'
  }

  const guard = withTimeout(signal, PROBE_TIMEOUT_MS)
  try {
    await fetch(PROBE_URL, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: guard.signal,
    })
    return 'refused'
  } catch {
    return guard.timedOut ? 'slow' : 'blocked'
  } finally {
    guard.done()
  }
}

/** What to tell the guest, and what they can actually do about it. */
export function appleFailureMessage(kind: AppleFailure): string {
  switch (kind) {
    case 'offline':
      return 'Your phone is offline, so song search can’t run. Reconnect, or type the song in below.'
    case 'blocked':
      return 'Something on this phone is blocking Apple’s song search — usually an ad blocker, a content blocker, or a filtering VPN or DNS profile. Allow itunes.apple.com, or type the song in below.'
    case 'refused':
      return 'Apple is limiting searches from this network right now — too many at once from the same WiFi. Wait a minute, or type the song in below.'
    case 'slow':
      return 'Apple’s song search didn’t respond in time. Your connection may be slow or filtered — you can type the song in below.'
  }
}

/** The 100px thumbnail the API returns is soft on a modern phone. */
function upscaleArtwork(url: string | undefined): string | null {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\./, '/300x300bb.')
}

/**
 * Search Apple, and fall back to MusicBrainz if Apple cannot be reached.
 *
 * The fallback covers the two ways Apple goes quiet on a guest: the venue's
 * shared address running out of rate-limit budget, and `itunes.apple.com`
 * sitting on several ad-blocker lists. Neither is something app code can talk
 * its way out of, and MusicBrainz is subject to neither — see musicbrainz.ts.
 * It is only ever reached when the first attempt fails, so the better results
 * stay the default.
 */
export async function searchCatalog(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogResults> {
  try {
    return { songs: await searchApple(term, opts), source: 'apple' }
  } catch (err) {
    // Only a caller abort reaches here as a DOMException; a timeout has
    // already been turned into a ServiceError, which falls through.
    if (err instanceof DOMException && err.name === 'AbortError') throw err

    /**
     * Ask Apple again, as a script rather than as data.
     *
     * The failure above is very often CORS rather than Apple — the browser
     * refusing to hand over a response that arrived perfectly well — and a
     * script tag is not subject to CORS at all. Worth one more attempt before
     * settling for a catalogue with no artwork in it.
     */
    try {
      return { songs: await searchAppleJsonp(term, opts), source: 'apple' }
    } catch (jsonpErr) {
      if (jsonpErr instanceof DOMException && jsonpErr.name === 'AbortError') {
        throw jsonpErr
      }
    }

    // Started rather than awaited, so working out why Apple failed costs no
    // wall time — it runs while the fallback is being fetched.
    const diagnosis = probeApple(opts?.signal)

    /**
     * Deezer before MusicBrainz, because it has artwork. A list of bare text
     * rows is what made search feel like no improvement on typing, and Deezer
     * needs no key and no CORS to avoid it.
     */
    try {
      return {
        songs: await searchDeezer(term, opts),
        source: 'deezer',
        appleFailure: await diagnosis,
      }
    } catch (deezerErr) {
      if (deezerErr instanceof DOMException && deezerErr.name === 'AbortError') {
        throw deezerErr
      }
    }

    try {
      return {
        songs: await searchMusicBrainz(term, opts),
        source: 'musicbrainz',
        appleFailure: await diagnosis,
      }
    } catch (fallbackErr) {
      if (fallbackErr instanceof DOMException) throw fallbackErr
      // Nothing answered, so this is all the guest gets — make it the sentence
      // that names the actual problem rather than the generic first failure.
      throw new ServiceError('network', appleFailureMessage(await diagnosis))
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

  const guard = withTimeout(opts?.signal, TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { signal: guard.signal })
  } catch (err) {
    /**
     * The caller superseding this search is not a failure and must not fall
     * through to another source — that would race the newer search. Our own
     * timeout is a failure, and must.
     */
    if (!guard.timedOut && err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }

    /**
     * A throw here is usually a rate limit rather than a dead connection.
     * Apple attaches CORS headers to the results but not to its `429`, so the
     * browser refuses to show us that response at all and reports the same
     * opaque failure it would for an unreachable host or a blocked request.
     * The three are indistinguishable from here, so the wording covers them
     * without claiming to know which — the fallback below decides whether the
     * guest ever sees it.
     */
    throw new ServiceError(
      'network',
      'Song search is busy right now. Wait a moment, or type the song in below.',
    )
  } finally {
    // Whatever happened, stop the clock — a pending timer would abort a
    // controller nobody is listening to and keep the page awake for nothing.
    guard.done()
  }

  if (response.status === 403 || response.status === 429) {
    throw new ServiceError(
      'network',
      'Song search is busy right now. Wait a moment, or type the song in below.',
    )
  }
  if (!response.ok) {
    throw new ServiceError(
      'network',
      'Song search is unavailable right now. You can type the song in below.',
    )
  }

  const body = (await response.json()) as { results?: ItunesResult[] }

  return mapItunesResults(body.results ?? [])
}

/** Apple's rows, filtered to real songs. Shared with the JSONP transport. */
export function mapItunesResults(rows: ItunesResult[]): CatalogSong[] {
  return rows
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

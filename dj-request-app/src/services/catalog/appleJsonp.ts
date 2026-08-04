import type { CatalogSong, ItunesResult } from './appleCatalog'
import { mapItunesResults } from './appleCatalog'
import { jsonp } from './jsonp'

/**
 * The same Apple search, fetched as a script instead of as data.
 *
 * `fetch` is subject to CORS, and CORS is where this keeps failing: the
 * browser will not hand the page a cross-origin response unless the server
 * attaches `access-control-allow-origin`, and it reports the refusal as an
 * error indistinguishable from the host being unreachable. Two very different
 * situations end up here — Apple returning a `429` (whose error responses
 * carry no CORS headers) and Apple returning perfectly good results whose
 * header was stripped or never sent to this particular caller — and the page
 * cannot tell them apart.
 *
 * A `<script>` tag is not subject to any of it. The browser has been loading
 * cross-origin scripts since before CORS existed, so the response is executed
 * whatever headers it carries, and Apple's search endpoint has supported the
 * `callback` parameter needed for it all along. If the results were coming
 * back fine and only the header was missing, this gets them.
 *
 * It also changes what the request *is*. Content blockers match on resource
 * type as well as host, and a rule aimed at background data requests to a host
 * frequently does not cover a script from it.
 *
 * The trade-off is real and worth stating: JSONP executes whatever comes back
 * as code. That is acceptable here for one reason only — the source is Apple's
 * own endpoint over HTTPS, so anyone able to substitute the response could
 * already have substituted the app. It is the second attempt rather than the
 * first because a plain `fetch`, when it works, involves no such reasoning.
 */

/** Matches the fetch path's budget, so a hung script cannot outlive it. */
const TIMEOUT_MS = 7_000

const ENDPOINT = 'https://itunes.apple.com/search'

export async function searchAppleJsonp(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  const query = term.trim()
  if (!query) return []

  const body = await jsonp<{ results?: ItunesResult[] }>(
    ENDPOINT,
    {
      term: query,
      media: 'music',
      entity: 'song',
      limit: String(opts?.limit ?? 20),
    },
    { signal: opts?.signal, timeoutMs: TIMEOUT_MS },
  )

  return mapItunesResults(body.results ?? [])
}

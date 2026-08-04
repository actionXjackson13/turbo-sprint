import { ServiceError } from '../types'
import type { CatalogSong, ItunesResult } from './appleCatalog'
import { mapItunesResults } from './appleCatalog'

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

let counter = 0

/**
 * The script attempt, swappable.
 *
 * jsdom never loads an external script and never reports that it hasn't, so a
 * suite exercising the MusicBrainz fallback would sit on this transport's
 * timeout for every case. Tests that are not about JSONP turn it off; the
 * tests that are about it drive `searchAppleJsonp` directly.
 */
type JsonpSearch = typeof searchAppleJsonp
let transport: JsonpSearch | null = null

export function runAppleJsonp(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  return (transport ?? searchAppleJsonp)(term, opts)
}

/** Test hook. Pass null to restore the real script transport. */
export function __setAppleJsonp(next: JsonpSearch | null): void {
  transport = next
}

interface JsonpWindow {
  [key: string]: unknown
}

export function searchAppleJsonp(
  term: string,
  opts?: { signal?: AbortSignal; limit?: number },
): Promise<CatalogSong[]> {
  const query = term.trim()
  if (!query) return Promise.resolve([])

  // No DOM to hang a script on — a test environment, or server rendering.
  if (typeof document === 'undefined') {
    return Promise.reject(
      new ServiceError('network', 'Song search is unavailable here.'),
    )
  }

  return new Promise<CatalogSong[]>((resolve, reject) => {
    const name = `__soundboardCatalog${counter++}`
    const script = document.createElement('script')
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      opts?.signal?.removeEventListener('abort', onAbort)
      delete (window as unknown as JsonpWindow)[name]
      script.remove()
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    ;(window as unknown as JsonpWindow)[name] = (payload: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      const body = payload as { results?: ItunesResult[] }
      resolve(mapItunesResults(body.results ?? []))
    }

    function onAbort() {
      fail(new DOMException('Aborted', 'AbortError'))
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    /**
     * A script that 404s, is blocked, or returns a non-JavaScript error page
     * fires `error` — and one that is simply never answered fires nothing at
     * all, which is what the timer is for.
     */
    const timer = setTimeout(
      () =>
        fail(
          new ServiceError(
            'network',
            'Apple’s song search didn’t respond in time.',
          ),
        ),
      TIMEOUT_MS,
    )

    script.onerror = () =>
      fail(new ServiceError('network', 'Apple’s song search refused this request.'))

    script.src = `${ENDPOINT}?${new URLSearchParams({
      term: query,
      media: 'music',
      entity: 'song',
      limit: String(opts?.limit ?? 20),
      callback: name,
    })}`
    script.async = true
    document.head.appendChild(script)
  })
}

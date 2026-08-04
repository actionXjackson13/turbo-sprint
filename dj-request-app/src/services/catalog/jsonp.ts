import { ServiceError } from '../types'

/**
 * Fetch across origins as a script, for services that will not send CORS
 * headers to a browser.
 *
 * CORS decides whether a page may *read* a cross-origin response, not whether
 * the server sent one — so a perfectly good answer with no
 * `access-control-allow-origin` on it fails identically to an unreachable
 * host, and the page cannot tell which happened. A `<script>` tag predates all
 * of that and is subject to none of it: the response is executed whatever
 * headers it carries.
 *
 * Both catalogues here need it for different reasons. Apple sends the header
 * most of the time and this is the retry for when it does not; Deezer never
 * sends it at all, and offers this instead.
 *
 * It executes what comes back as code, which is the cost. That is acceptable
 * against a known HTTPS endpoint — anyone able to substitute that response
 * could already have substituted the app itself — and unacceptable as a
 * general-purpose fetch, so this stays private to the catalogue layer.
 */

/** Long enough for a slow phone, short enough not to feel broken. */
const DEFAULT_TIMEOUT_MS = 7_000

let counter = 0

export interface JsonpOptions {
  /** The query parameter the service reads the callback name from. */
  callbackParam?: string
  /** Extra parameters some services need to switch JSONP on. */
  extraParams?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
}

type JsonpRunner = <T>(
  endpoint: string,
  params: Record<string, string>,
  options?: JsonpOptions,
) => Promise<T>

let runner: JsonpRunner | null = null

/**
 * Test hook. Pass null to restore real script loading.
 *
 * jsdom never loads an external script and never reports that it hasn't, so
 * every suite that exercises a fallback would otherwise sit through this
 * transport's timeout once per source. One switch covers every catalogue that
 * uses it.
 */
export function __setJsonp(next: JsonpRunner | null): void {
  runner = next
}

export function jsonp<T>(
  endpoint: string,
  params: Record<string, string>,
  options: JsonpOptions = {},
): Promise<T> {
  if (runner) return runner<T>(endpoint, params, options)
  return jsonpRequest<T>(endpoint, params, options)
}

function jsonpRequest<T>(
  endpoint: string,
  params: Record<string, string>,
  options: JsonpOptions = {},
): Promise<T> {
  // No DOM to hang a script on — a server, or a test environment.
  if (typeof document === 'undefined') {
    return Promise.reject(
      new ServiceError('network', 'Song search is unavailable here.'),
    )
  }

  const {
    callbackParam = 'callback',
    extraParams = {},
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options

  return new Promise<T>((resolve, reject) => {
    const name = `__soundboardCatalog${counter++}`
    const script = document.createElement('script')
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      delete (window as unknown as Record<string, unknown>)[name]
      script.remove()
    }

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    ;(window as unknown as Record<string, unknown>)[name] = (payload: T) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(payload)
    }

    function onAbort() {
      fail(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    /**
     * A script that 404s, is blocked, or comes back as a non-JavaScript error
     * page fires `error`. One that is never answered fires nothing at all,
     * which is what the timer is for — an unanswered request is the failure
     * that hurts, because nothing downstream of it ever runs.
     */
    const timer = setTimeout(
      () =>
        fail(
          new ServiceError('network', 'Song search didn’t respond in time.'),
        ),
      timeoutMs,
    )

    script.onerror = () =>
      fail(new ServiceError('network', 'Song search refused this request.'))

    script.src = `${endpoint}?${new URLSearchParams({
      ...params,
      ...extraParams,
      [callbackParam]: name,
    })}`
    script.async = true
    document.head.appendChild(script)
  })
}

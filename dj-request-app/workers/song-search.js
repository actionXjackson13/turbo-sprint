/**
 * Song search proxy.
 *
 * Ad blockers match on the hostname the *browser* asks for, and
 * `itunes.apple.com` is on several lists — not because song search tracks
 * anyone, but because Apple serves other things from that host. A guest
 * running AdGuard has the request killed before it leaves the phone, and no
 * amount of app code changes that.
 *
 * Moving the call here fixes it for every guest at once: the phone asks this
 * worker, on a domain that is on nobody's list, and the worker asks Apple.
 * Server-to-server, where no blocker exists.
 *
 * Deploy free on Cloudflare Workers — see the README. No account is needed to
 * run the app without it; the client falls back to calling Apple directly.
 */

/** Only these origins may use the proxy, so it cannot be borrowed. */
const ALLOWED_ORIGINS = [
  'https://actionxjackson13.github.io',
  'http://localhost:5173',
]

/**
 * Cache window. Parties ask for the same songs all night, so most searches
 * never reach Apple — which also makes Apple's per-IP rate limit irrelevant,
 * since every guest now shares this worker's cache rather than the venue's
 * one WiFi address.
 */
const CACHE_SECONDS = 600

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') ?? ''
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: cors })
    }

    const term = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    if (!term) {
      return Response.json(
        { results: [] },
        { headers: { ...cors, 'Cache-Control': 'no-store' } },
      )
    }

    // Cap the term: this is a search box, not a tunnel for arbitrary payloads.
    const query = term.slice(0, 120)

    const upstream = `https://itunes.apple.com/search?${new URLSearchParams({
      term: query,
      media: 'music',
      entity: 'song',
      limit: '20',
    })}`

    // Cloudflare's edge cache keyed on the upstream URL, so identical searches
    // from different guests are one request to Apple.
    const cache = caches.default
    const cacheKey = new Request(upstream, { method: 'GET' })

    let response = await cache.match(cacheKey)

    if (!response) {
      const fetched = await fetch(upstream, {
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      })

      if (!fetched.ok) {
        return new Response('Song search is unavailable right now.', {
          status: 502,
          headers: cors,
        })
      }

      // Apple answers as text/javascript; re-serve it as JSON.
      const body = await fetched.text()
      response = new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        },
      })
      await cache.put(cacheKey, response.clone())
    }

    const out = new Response(response.body, response)
    for (const [key, value] of Object.entries(cors)) out.headers.set(key, value)
    return out
  },
}

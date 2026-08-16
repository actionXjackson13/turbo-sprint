// @ts-nocheck — this file runs on Deno inside Supabase, not in the app build.
import { parsePlaylist, playlistUrl } from './parse.ts'

/**
 * Fetches an Apple Music playlist page and returns the song ids on it.
 *
 * This exists for one reason: Apple serves those pages without the header a
 * browser needs to read another site's response, so the app cannot fetch one
 * itself however much it would like to. Something outside the browser has to
 * do it, and that is the whole of this function's job.
 *
 * It deliberately returns *ids only*. Titles and artists are looked up
 * afterwards by the app, through Apple's free catalogue endpoint it already
 * uses everywhere else — so there is one idea of what a song is called, and
 * nothing here has to be rewritten when a page's markup shifts.
 */

const ALLOWED_METHODS = 'POST, OPTIONS'

/**
 * Open to any origin.
 *
 * The function reads one public web page and returns public catalogue ids. It
 * holds no secret, touches no table, and tells a caller nothing they could not
 * fetch themselves with a browser open. Locking it to one origin would only
 * break the app the day it moves domain.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
}

/** Long enough for a slow page, short enough not to hold a phone waiting. */
const FETCH_TIMEOUT_MS = 12_000

/** Apple serves a different, emptier page to something that looks automated. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  let payload: { url?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Send a JSON body with a url.' }, 400)
  }

  const target = playlistUrl(payload.url)
  if (!target) {
    return json(
      {
        error:
          'That does not look like an Apple Music playlist link. Open the playlist in Apple Music, tap Share, and copy the link.',
      },
      400,
    )
  }

  let html: string
  try {
    const response = await fetch(target, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })

    if (response.status === 404) {
      return json(
        {
          error:
            'Apple could not find that playlist. A personal playlist has to be shared before its link works — open it in Apple Music, tap the three dots, and turn on sharing.',
        },
        404,
      )
    }
    if (!response.ok) {
      return json({ error: `Apple returned ${response.status}.` }, 502)
    }
    html = await response.text()
  } catch {
    return json({ error: 'Could not reach Apple Music. Try again.' }, 504)
  }

  const playlist = parsePlaylist(html)
  if (!playlist) {
    return json(
      {
        error:
          'That page loaded but had no songs on it. If the playlist is private, share it first; Apple only puts the track list on a page anyone can open.',
      },
      422,
    )
  }

  return json(playlist)
})

// @ts-nocheck — this file runs on Deno inside Supabase, not in the app build.
//
// GENERATED FILE. Do not edit: run `npm run function` after changing
// parse.ts or handler.ts in this directory, which is where this actually lives.
//
// It is one file on purpose. Supabase's in-browser editor gives you a single
// index.ts, and this is meant to be pasted into it whole — nothing else to add,
// nothing to name correctly, no second file to forget.

/**
 * Reading an Apple Music playlist page.
 *
 * Deliberately free of any Deno or browser API so the same code runs inside the
 * edge function and inside the test suite. Everything here is string in, data
 * out.
 *
 * Apple publishes no public API for this — the Music API needs a paid developer
 * membership — but a playlist's own web page carries its track list in a
 * `<script type="application/ld+json">` block, which is a documented schema.org
 * shape rather than a private one. That is what this reads.
 *
 * Only the song *ids* are taken from the page. Titles and artists come
 * afterwards from Apple's free lookup endpoint, which is already how the rest
 * of this app talks to the catalogue: one source of truth for what a song is
 * called, and no scraping of anything that might be laid out differently
 * tomorrow.
 */

export interface ParsedPlaylist {
  /** The playlist's own name, when the page gives one. */
  name: string | null
  /** Apple catalogue song ids, in playlist order, deduplicated. */
  songIds: string[]
}

/** `https://music.apple.com/gb/song/whatever/1817609509` → `1817609509`. */
const SONG_URL = /music\.apple\.com\/[a-z]{2}\/song\/[^"'\s]*?\/(\d{5,})/g

interface LdTrack {
  name?: unknown
  url?: unknown
}

interface LdPlaylist {
  '@type'?: unknown
  name?: unknown
  track?: unknown
}

function idFromUrl(url: string): string | null {
  SONG_URL.lastIndex = 0
  const match = SONG_URL.exec(url)
  return match?.[1] ?? null
}

/**
 * The structured block, which is the good path: it is ordered, it is only the
 * playlist's own tracks, and it is a published schema rather than markup.
 */
function fromJsonLd(html: string): ParsedPlaylist | null {
  const blocks = html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )

  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block[1] ?? '')
    } catch {
      continue
    }

    const doc = parsed as LdPlaylist
    if (doc['@type'] !== 'MusicPlaylist' || !Array.isArray(doc.track)) continue

    const songIds: string[] = []
    for (const entry of doc.track as LdTrack[]) {
      const url = typeof entry?.url === 'string' ? entry.url : ''
      const id = idFromUrl(url)
      if (id && !songIds.includes(id)) songIds.push(id)
    }
    if (songIds.length === 0) continue

    return {
      name: typeof doc.name === 'string' ? doc.name.trim() || null : null,
      songIds,
    }
  }

  return null
}

/**
 * Anything that looks like a song link, in the order it appears.
 *
 * A last resort for a page that renders links but no structured block — a
 * shape I have seen on curated playlists but cannot promise for every personal
 * one, which is the whole reason there is a fallback at all. Order still holds,
 * because the page lists tracks in playlist order.
 */
function fromSongLinks(html: string): ParsedPlaylist | null {
  const songIds: string[] = []
  for (const match of html.matchAll(SONG_URL)) {
    const id = match[1]
    if (id && !songIds.includes(id)) songIds.push(id)
  }
  if (songIds.length === 0) return null
  return { name: titleOf(html), songIds }
}

function titleOf(html: string): string | null {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html)
  if (!match?.[1]) return null
  // Apple appends its own suffix; the playlist's name is the part before it.
  const raw = match[1].replace(/\s*[|–—-]\s*Apple Music\s*$/i, '').trim()
  return raw || null
}

/** Pulls a playlist out of its page, or returns null if there isn't one. */
export function parsePlaylist(html: string): ParsedPlaylist | null {
  return fromJsonLd(html) ?? fromSongLinks(html)
}

// ---------------------------------------------------------------------------
// What we are willing to fetch
// ---------------------------------------------------------------------------

/**
 * Only Apple Music playlist pages.
 *
 * This function fetches a URL supplied by whoever calls it, which without a
 * check is a server that will fetch anything on request — including addresses
 * reachable only from inside the hosting network. The allowlist is the whole
 * defence, so it is deliberately narrow: https, one host, and a path that looks
 * like a playlist.
 */
export function playlistUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.trim() === '') return null

  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (url.hostname !== 'music.apple.com') return null
  if (!/\/playlist\//.test(url.pathname)) return null

  // Drop everything else: query strings on these carry referral and session
  // parameters that have no business being forwarded.
  return new URL(url.origin + url.pathname)
}

// ---------------------------------------------------------------------------
// The request handler
// ---------------------------------------------------------------------------

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

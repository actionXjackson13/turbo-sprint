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

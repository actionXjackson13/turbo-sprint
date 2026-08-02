/**
 * The link a guest follows to join an event.
 *
 * Built from the running page's own origin and base path rather than a
 * configured constant, so the same code produces a working link on localhost,
 * on the GitHub Pages subdirectory, and on any future host — a hard-coded
 * domain is exactly the kind of thing that silently breaks after a move.
 *
 * The code travels in the hash, not the query string: the app uses hash
 * routing (the Pages deploy has no SPA rewrite), and a query before the hash
 * would be dropped on the way to the router.
 */
export function buildJoinUrl(code: string, origin?: string): string {
  const base =
    origin ??
    (typeof window === 'undefined'
      ? ''
      : // BASE_URL always has a trailing slash; strip it so we don't double up.
        window.location.origin +
        import.meta.env.BASE_URL.replace(/\/$/, ''))

  return `${base}/#/join?code=${encodeURIComponent(code)}`
}

/** Reads a prefilled code out of a hash-route query, if present. */
export function readCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search)
  const code = params.get('code')?.trim()
  return code ? code.toUpperCase() : null
}

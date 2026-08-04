import { useEffect, useState } from 'react'
import {
  searchCatalog,
  type CatalogResults,
  type CatalogSong,
  type CatalogSource,
  type AppleFailure,
} from '../../services/catalog/appleCatalog'
import { getErrorMessage } from '../../utils/errors'

/**
 * Wait this long after the last keystroke before searching.
 *
 * The catalogue's rate limit is per IP, and everyone at an event shares the
 * venue's WiFi — so a search on every keystroke would spend the whole room's
 * budget on one person typing, and the room finds out by watching search die
 * mid-party. Long enough to cover a pause for thought mid-title, short enough
 * that a guest who has finished typing is not left waiting on it.
 */
const DEBOUNCE_MS = 600

/**
 * Below this, results are noise — and a two-letter search is nearly always a
 * guest still typing, so it costs a request to show nothing anyone wanted.
 */
const MIN_CHARS = 3

/**
 * Terms already answered, kept for the life of the page.
 *
 * Searching is a loop: type, squint, backspace, retype, scroll back to the
 * result that was already there. Every repeat of a term the app has seen is a
 * request it does not have to spend, and the answers do not go stale inside a
 * party. Bounded because a long session should not grow without limit; the
 * cap is far above what one guest finding one song will ever touch.
 */
const CACHE_LIMIT = 50
const cache = new Map<string, CatalogResults>()

function remember(key: string, results: CatalogResults) {
  // Re-insert so the most recently used entry is last, and evict from the
  // front — the oldest untouched term is the cheapest one to have to ask for
  // again.
  cache.delete(key)
  cache.set(key, results)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
}

export interface CatalogSearchState {
  results: CatalogSong[]
  loading: boolean
  error: string | null
  /** True once a search has run and come back with nothing. */
  empty: boolean
  /**
   * Which catalogue answered.
   *
   * Surfaced because the difference is visible and otherwise inexplicable:
   * Apple's results carry artwork and an Apple Music link, MusicBrainz's are
   * bare text. A guest seeing the bare version has no way to know they are
   * looking at the fallback rather than at a worse app.
   */
  source: CatalogSource | null
  /** Why Apple was skipped, when it was. Drives what the guest is told. */
  appleFailure: AppleFailure | null
}

export function useCatalogSearch(term: string): CatalogSearchState {
  const [state, setState] = useState<CatalogSearchState>({
    results: [],
    loading: false,
    error: null,
    empty: false,
    source: null,
    appleFailure: null,
  })

  useEffect(() => {
    const query = term.trim()
    if (query.length < MIN_CHARS) {
      setState({
        results: [],
        loading: false,
        error: null,
        empty: false,
        source: null,
        appleFailure: null,
      })
      return
    }

    const key = query.toLowerCase()
    const cached = cache.get(key)
    if (cached) {
      // Straight to the answer: no debounce to sit through and no spinner, so
      // backspacing to a term already seen feels like the results never left.
      remember(key, cached)
      setState({
        results: cached.songs,
        loading: false,
        error: null,
        empty: cached.songs.length === 0,
        source: cached.source,
        appleFailure: cached.appleFailure ?? null,
      })
      return
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await searchCatalog(query, {
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          remember(key, results)
          setState({
            results: results.songs,
            loading: false,
            error: null,
            empty: results.songs.length === 0,
            source: results.source,
            appleFailure: results.appleFailure ?? null,
          })
        } catch (err) {
          if (controller.signal.aborted) return
          setState({
            results: [],
            loading: false,
            error: getErrorMessage(err),
            empty: false,
            source: null,
            appleFailure: null,
          })
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      // Supersede a request still in flight rather than letting a slow, stale
      // response overwrite a newer one.
      controller.abort()
    }
  }, [term])

  return state
}

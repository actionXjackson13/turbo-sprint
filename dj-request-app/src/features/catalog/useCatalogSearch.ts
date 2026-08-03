import { useEffect, useState } from 'react'
import {
  searchCatalog,
  type CatalogSong,
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
const cache = new Map<string, CatalogSong[]>()

function remember(key: string, results: CatalogSong[]) {
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
}

export function useCatalogSearch(term: string): CatalogSearchState {
  const [state, setState] = useState<CatalogSearchState>({
    results: [],
    loading: false,
    error: null,
    empty: false,
  })

  useEffect(() => {
    const query = term.trim()
    if (query.length < MIN_CHARS) {
      setState({ results: [], loading: false, error: null, empty: false })
      return
    }

    const key = query.toLowerCase()
    const cached = cache.get(key)
    if (cached) {
      // Straight to the answer: no debounce to sit through and no spinner, so
      // backspacing to a term already seen feels like the results never left.
      remember(key, cached)
      setState({
        results: cached,
        loading: false,
        error: null,
        empty: cached.length === 0,
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
            results,
            loading: false,
            error: null,
            empty: results.length === 0,
          })
        } catch (err) {
          if (controller.signal.aborted) return
          setState({
            results: [],
            loading: false,
            error: getErrorMessage(err),
            empty: false,
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

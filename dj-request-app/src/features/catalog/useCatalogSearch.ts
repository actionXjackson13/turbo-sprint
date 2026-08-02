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
 * budget on one person typing. Debounced, finding a song costs one or two
 * requests instead of a dozen.
 */
const DEBOUNCE_MS = 400

/** Below this, results are noise. */
const MIN_CHARS = 2

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

    setState((prev) => ({ ...prev, loading: true, error: null }))

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await searchCatalog(query, {
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
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

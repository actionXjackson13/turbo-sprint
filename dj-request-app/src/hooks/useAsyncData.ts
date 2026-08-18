import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../utils/errors'
import type { Unsubscribe } from '../services/types'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Re-runs the loader, leaving existing data on screen while it refreshes. */
  reload: () => Promise<void>
}

/**
 * Runs an async loader and tracks loading/error state.
 *
 * `loader` must be referentially stable — wrap it in useCallback. That keeps
 * the effect from re-firing on every render and makes the refresh points
 * explicit at the call site.
 */
export function useAsyncData<T>(loader: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mounted = useRef(true)
  /** Whether anything has ever loaded, read outside render by `run`. */
  const hasData = useRef(false)
  // Guards against an earlier, slower response overwriting a newer one.
  const sequence = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const ticket = ++sequence.current
    /**
     * Only the first load is a loading state.
     *
     * A refresh — a realtime change, a return to the tab, a screen remounting
     * on a tab switch — used to replace whatever was on screen with skeletons
     * for as long as the round trip took. That is what made the app feel slow
     * everywhere rather than just on opening: the data was usually already
     * there and correct, and it was being hidden anyway.
     */
    if (!hasData.current) setLoading(true)
    try {
      const result = await loader()
      if (!mounted.current || ticket !== sequence.current) return
      hasData.current = true
      setData(result)
      setError(null)
    } catch (err) {
      if (!mounted.current || ticket !== sequence.current) return
      setError(getErrorMessage(err))
    } finally {
      if (mounted.current && ticket === sequence.current) setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    void run()
  }, [run])

  return { data, loading, error, reload: run }
}

/**
 * useAsyncData plus a live subscription: whenever the backend reports a change
 * on the given channel, the loader re-runs.
 *
 * Also refreshes when the tab regains focus or the network comes back, which is
 * what makes the app recover cleanly after a phone has been asleep or offline.
 */
export function useLiveData<T>(
  loader: () => Promise<T>,
  subscribe: ((onChange: () => void) => Unsubscribe) | null,
): AsyncState<T> {
  const state = useAsyncData(loader)
  const { reload } = state
  // Mount counts as a refresh: the loader has just run.
  const lastRefresh = useRef(Date.now())

  useEffect(() => {
    if (!subscribe) return
    return subscribe(() => {
      lastRefresh.current = Date.now()
      void reload()
    })
  }, [subscribe, reload])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      /**
       * A glance away is not a reason to ask again.
       *
       * This exists to recover after a phone has been asleep or offline, where
       * the live subscription will have been dropped and reconnected. A DJ
       * flicking to their messages and straight back is a different thing
       * entirely, and it was costing a full reload of every screen each time —
       * which, on a screen watching several things at once, was most of why
       * the app felt slow to come back to.
       */
      if (Date.now() - lastRefresh.current < STALE_AFTER_MS) return
      lastRefresh.current = Date.now()
      void reload()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [reload])

  return state
}

/**
 * How long a returning screen is trusted without asking again.
 *
 * Long enough that switching apps to read a text does not reload the party;
 * short enough that a phone left in a pocket through two songs comes back
 * current.
 */
const STALE_AFTER_MS = 15_000

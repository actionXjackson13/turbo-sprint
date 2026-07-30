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
    setLoading(true)
    try {
      const result = await loader()
      if (!mounted.current || ticket !== sequence.current) return
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

  useEffect(() => {
    if (!subscribe) return
    return subscribe(() => {
      void reload()
    })
  }, [subscribe, reload])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void reload()
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

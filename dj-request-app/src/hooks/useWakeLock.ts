import { useEffect } from 'react'

/**
 * Holds a screen wake lock while the component is mounted.
 *
 * A DJ's phone locking itself mid-set is a genuine nuisance: the queue is a
 * glanceable display, and having to wake and unlock the device every thirty
 * seconds is exactly the wrong interaction while mixing. This keeps the DJ's
 * event screens awake and releases the lock the moment they navigate away, so
 * a guest's phone (and the DJ's battery) is never held hostage.
 *
 * The API is Chromium-and-Safari-16.4+ only and is refused outright when the
 * page is hidden, so every path here is best-effort.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let released = false

    const request = async () => {
      // The browser rejects a request from a hidden page; wait for the
      // visibility handler below to retry instead.
      if (document.visibilityState !== 'visible' || released) return
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Denied (battery saver, unsupported, not user-activated). Fine.
      }
    }

    // The system drops the lock whenever the tab is backgrounded, so it has to
    // be re-acquired on return rather than assumed to persist.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => {})
    }
  }, [enabled])
}

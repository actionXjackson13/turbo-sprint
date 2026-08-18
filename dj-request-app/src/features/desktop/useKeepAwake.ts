import { useEffect } from 'react'
import { desktop } from './bridge'

/**
 * Stopping the DJ's laptop sleeping while an event is open.
 *
 * The app already asks the browser for a wake lock (`useWakeLock`), which is
 * the right thing on a phone propped against a speaker. On a laptop it is not
 * enough: the browser drops the lock the moment its tab stops being visible,
 * and a DJ working in rekordbox has SoundBoard behind it all night by design.
 *
 * So when the shell is there, it holds the lock instead — from outside the
 * browser, where being covered up is not a reason to let go. A no-op in a
 * browser, where `useWakeLock` remains the whole story.
 */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    const shell = desktop()
    if (!shell || !active) return

    shell.keepAwake(true)
    return () => shell.keepAwake(false)
  }, [active])
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useService } from '../hooks/useService'
import type { Profile } from '../types/domain'
import { DjAuthContext, type DjAuthValue } from './djAuthContext'

/**
 * Holds the signed-in DJ.
 *
 * Session restoration is delegated to the backend (Supabase persists and
 * refreshes its own tokens), so a reload keeps the DJ signed in without this
 * app storing credentials anywhere.
 */
export function DjAuthProvider({ children }: { children: ReactNode }) {
  const service = useService()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const current = await service.getCurrentDjProfile()
        if (!cancelled) setProfile(current)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const unsubscribe = service.onDjAuthStateChange((next) => {
      if (!cancelled) setProfile(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [service])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setProfile(await service.signInDj(email, password))
    },
    [service],
  )

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      setProfile(await service.signUpDj(email, password, displayName))
    },
    [service],
  )

  const signOut = useCallback(async () => {
    await service.signOutDj()
    setProfile(null)
  }, [service])

  const value = useMemo<DjAuthValue>(
    () => ({ profile, loading, signIn, signUp, signOut }),
    [profile, loading, signIn, signUp, signOut],
  )

  return (
    <DjAuthContext.Provider value={value}>{children}</DjAuthContext.Provider>
  )
}

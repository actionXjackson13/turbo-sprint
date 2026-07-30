import { createContext } from 'react'
import type { Profile } from '../types/domain'

export interface DjAuthValue {
  profile: Profile | null
  /** True until the initial session check completes. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>
  signOut: () => Promise<void>
}

export const DjAuthContext = createContext<DjAuthValue | null>(null)

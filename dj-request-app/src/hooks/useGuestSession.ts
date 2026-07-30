import { useContext } from 'react'
import {
  GuestSessionContext,
  type GuestSessionValue,
} from '../contexts/guestSessionContext'

export function useGuestSession(): GuestSessionValue {
  const ctx = useContext(GuestSessionContext)
  if (!ctx) {
    throw new Error(
      'useGuestSession must be used within a <GuestSessionProvider>',
    )
  }
  return ctx
}

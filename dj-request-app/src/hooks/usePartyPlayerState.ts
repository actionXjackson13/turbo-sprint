import { useContext } from 'react'
import { PartyPlayerContext } from '../contexts/partyPlayerContext'
import type { PartyPlayerState } from '../features/player/usePartyPlayer'

export function usePartyPlayerState(): PartyPlayerState {
  const ctx = useContext(PartyPlayerContext)
  if (!ctx) {
    throw new Error(
      'usePartyPlayerState must be used within a <PartyPlayerProvider>',
    )
  }
  return ctx
}

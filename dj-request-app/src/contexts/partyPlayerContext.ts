import { createContext } from 'react'
import type { PartyPlayerState } from '../features/player/usePartyPlayer'

/**
 * The player is a context rather than a screen's own state for one reason: a
 * DJ who taps through to Requests mid-song must not have the music stop. React
 * unmounts a route's tree when you leave it, and the embedded player goes with
 * it, so the thing that owns playback has to sit above the router outlet.
 */
export const PartyPlayerContext = createContext<PartyPlayerState | null>(null)

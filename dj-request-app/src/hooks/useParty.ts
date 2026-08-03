import { useSyncExternalStore } from 'react'
import {
  getPartyState,
  subscribeParty,
  type PartyState,
} from '../services/partySession'

/**
 * The live party's state: hosting, joined, or neither.
 *
 * `useSyncExternalStore` rather than an effect and local state, because the
 * party is owned by a module and changed by the network — the DJ's guest count
 * moves when a phone across the room connects, not when React renders.
 */
export function useParty(): PartyState {
  return useSyncExternalStore(subscribeParty, getPartyState, getPartyState)
}

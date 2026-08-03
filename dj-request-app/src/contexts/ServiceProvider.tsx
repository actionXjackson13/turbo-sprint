import { useSyncExternalStore, type ReactNode } from 'react'
import { getActiveService, subscribeParty } from '../services/partySession'
import type { DataService } from '../services/types'
import { ServiceContext } from './serviceContext'

export interface ServiceProviderProps {
  children: ReactNode
  /** Injection point for tests. Defaults to the environment-selected backend. */
  service?: DataService
}

export function ServiceProvider({ children, service }: ServiceProviderProps) {
  /**
   * Subscribed rather than resolved once: joining a party swaps the backend
   * underneath the whole app — the same screens start reading from the DJ's
   * phone instead of this device's own storage — and every screen has to
   * follow. Nothing above this needs to know that happened.
   */
  const active = useSyncExternalStore(
    subscribeParty,
    getActiveService,
    getActiveService,
  )

  return (
    <ServiceContext.Provider value={service ?? active}>
      {children}
    </ServiceContext.Provider>
  )
}

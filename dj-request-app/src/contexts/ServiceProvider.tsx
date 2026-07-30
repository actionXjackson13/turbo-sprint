import { useMemo, type ReactNode } from 'react'
import { getDataService } from '../services'
import type { DataService } from '../services/types'
import { ServiceContext } from './serviceContext'

export interface ServiceProviderProps {
  children: ReactNode
  /** Injection point for tests. Defaults to the environment-selected backend. */
  service?: DataService
}

export function ServiceProvider({ children, service }: ServiceProviderProps) {
  const value = useMemo(() => service ?? getDataService(), [service])
  return (
    <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>
  )
}

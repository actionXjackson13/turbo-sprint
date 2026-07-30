import { createContext } from 'react'
import type { EventRecord } from '../types/domain'

export interface DjEventValue {
  event: EventRecord | null
  guestCount: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export const DjEventContext = createContext<DjEventValue | null>(null)

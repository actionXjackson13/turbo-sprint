import { createContext } from 'react'
import type { EventGuest, EventRecord } from '../types/domain'

export interface GuestSessionValue {
  /** The event the guest has joined, once resolved. */
  event: EventRecord | null
  /** The guest's membership row for that event. */
  guest: EventGuest | null
  loading: boolean
  error: string | null
  /** Re-reads the event and membership (used after realtime changes). */
  refresh: () => Promise<void>
  /** Joins by code and stores the session. */
  join: (code: string, displayName: string) => Promise<EventRecord>
  /** Forgets the current event without clearing the guest identity. */
  leave: () => void
}

export const GuestSessionContext = createContext<GuestSessionValue | null>(null)

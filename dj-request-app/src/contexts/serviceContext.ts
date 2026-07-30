import { createContext } from 'react'
import type { DataService } from '../services/types'

/**
 * Holds the active data backend. Screens read it via `useService()` rather
 * than importing a concrete implementation, which is what keeps them agnostic
 * between demo mode and Supabase.
 */
export const ServiceContext = createContext<DataService | null>(null)

import { isDemoMode } from '../lib/env'
import { DemoService } from './demo/DemoService'
import type { DataService } from './types'

let instance: DataService | null = null

/**
 * Returns the active data backend.
 *
 * Supabase is used only when both credentials are present and demo mode is not
 * forced; otherwise the app falls back to the in-memory demo backend so it runs
 * with no configuration at all.
 */
export function getDataService(): DataService {
  if (!instance) {
    if (!isDemoMode()) {
      // Replaced with `new SupabaseService()` once the Supabase backend lands.
      throw new Error(
        'Supabase backend is not wired up yet. Unset VITE_SUPABASE_URL / ' +
          'VITE_SUPABASE_ANON_KEY, or set VITE_DEMO_MODE=true, to use demo mode.',
      )
    }
    instance = new DemoService()
  }
  return instance
}

/** Test hook — lets a suite inject a fresh or fake service. */
export function __setDataService(service: DataService | null): void {
  instance = service
}

export * from './types'

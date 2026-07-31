import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '../../lib/env'

let client: SupabaseClient | null = null

/**
 * Single Supabase client for the app.
 *
 * `persistSession` + `autoRefreshToken` are what make both DJ sign-in and the
 * anonymous guest identity survive a refresh: the session lives in
 * localStorage under Supabase's own key and is refreshed before it expires.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and ' +
          'VITE_SUPABASE_ANON_KEY, or run in demo mode.',
      )
    }
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        // Cap resubscribe chatter when a phone flaps between networks.
        params: { eventsPerSecond: 10 },
      },
    })
  }
  return client
}

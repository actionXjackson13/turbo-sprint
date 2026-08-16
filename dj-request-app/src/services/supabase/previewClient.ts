import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '../../lib/env'

/**
 * A second Supabase session, for the DJ to look at their own party as a guest.
 *
 * It has to be a separate client. A Supabase client holds exactly one session,
 * so signing in anonymously on the app's own client would sign the DJ *out* —
 * they would lose their account to look at their party, which is the opposite
 * of a preview. Giving this one its own storage key gives it its own session
 * beside the DJ's, and switching back is then a matter of ignoring it again
 * rather than signing anybody in.
 *
 * The guest it creates is a real guest: a real anonymous identity, joining
 * through the same RPC, subject to the same row level security. Nothing about
 * the party can tell it apart from someone at the door, which is the whole
 * point of looking.
 */

const STORAGE_KEY = 'sb-soundboard-guest-preview'

let client: SupabaseClient | null = null

export function getPreviewClient(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // The key that keeps this session out of the DJ's.
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return client
}

/**
 * Ends the preview identity for good.
 *
 * Signing out rather than just forgetting the client: the next preview should
 * be a fresh guest arriving, not the same one walking back in — a DJ testing
 * what a newcomer sees is badly served by a session that still remembers its
 * own requests and votes.
 */
export async function clearPreviewSession(): Promise<void> {
  if (!client) return
  try {
    await client.auth.signOut()
  } catch {
    // Already gone. The storage key is dropped below regardless.
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked; the session simply outlives the preview.
  }
  client = null
}

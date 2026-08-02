/**
 * Typed access to build-time environment configuration.
 *
 * The app is designed to run with zero configuration: if Supabase credentials
 * are absent (or demo mode is forced on), the local demo backend is used
 * instead. This is what lets `npm run dev` work immediately after clone.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
const forceDemo = import.meta.env.VITE_DEMO_MODE?.trim() === 'true'

export const supabaseUrl = url
export const supabaseAnonKey = anonKey

/** True when the app should use the in-memory demo backend. */
export function isDemoMode(): boolean {
  if (forceDemo) return true
  return url === '' || anonKey === ''
}

/**
 * Whether to surface the "Enter demo" shortcuts on the welcome screen.
 * These are development affordances and are hidden in a configured production
 * build so that real users never land in the sandbox by accident.
 */
export function showDemoShortcuts(): boolean {
  return isDemoMode()
}

/**
 * Optional proxy for song search.
 *
 * Set to a deployed `workers/song-search.js` URL to route catalogue lookups
 * through your own domain instead of calling `itunes.apple.com` from the
 * guest's phone. That is what makes search work for guests running an ad
 * blocker — see the README. Unset, the app calls Apple directly and falls back
 * to MusicBrainz if it cannot be reached.
 */
export const searchProxyUrl =
  import.meta.env.VITE_SEARCH_PROXY_URL?.trim() ?? ''

export const isDev = import.meta.env.DEV

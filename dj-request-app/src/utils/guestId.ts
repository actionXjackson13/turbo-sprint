/**
 * Local guest-identity storage.
 *
 * In demo mode this hand-rolled id *is* the guest's identity. Against a real
 * Supabase project the trusted identity is the anonymous auth user id (so RLS
 * can verify it) — see services/supabase/SupabaseService.ts. These helpers are
 * still used there to remember which event the guest last joined so a refresh
 * lands them back in the right place.
 */

const GUEST_ID_KEY = 'soundboard.guestId'
const LAST_EVENT_KEY = 'soundboard.lastEventId'
const DISPLAY_NAME_KEY = 'soundboard.displayName'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Private-mode Safari and blocked-storage contexts throw on access.
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable — the session simply won't survive a refresh.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* no-op */
  }
}

/** Returns the persistent local guest id, creating one on first call. */
export function getOrCreateLocalGuestId(): string {
  const existing = safeGet(GUEST_ID_KEY)
  if (existing) return existing

  const id = crypto.randomUUID()
  safeSet(GUEST_ID_KEY, id)
  return id
}

export function getLastEventId(): string | null {
  return safeGet(LAST_EVENT_KEY)
}

export function setLastEventId(eventId: string): void {
  safeSet(LAST_EVENT_KEY, eventId)
}

export function clearLastEventId(): void {
  safeRemove(LAST_EVENT_KEY)
}

/** Remembered so returning guests don't retype their name for a new event. */
export function getRememberedDisplayName(): string | null {
  return safeGet(DISPLAY_NAME_KEY)
}

export function setRememberedDisplayName(name: string): void {
  safeSet(DISPLAY_NAME_KEY, name)
}

import type { EventGuest } from '../../types/domain'
import { ServiceError, type Unsubscribe } from '../types'
import {
  channels,
  getActiveGuestUserId,
  getDb,
  mutate,
  nowIso,
  setActiveGuestUserId,
  subscribe,
} from './demoStore'

/**
 * Demo-only guest switching.
 *
 * A real client is one person: their identity comes from Supabase anonymous
 * auth and cannot be chosen. Demo mode has no such constraint, and being able
 * to act as several guests in turn is what makes the demo useful — you can
 * fill a queue from different people, watch votes accumulate from more than
 * one account, and see the DJ's side of it, all from a single browser.
 *
 * These helpers deliberately live outside `DataService`. Adding them to the
 * shared interface would oblige `SupabaseService` to implement something it
 * must never allow, so the switcher UI imports this module directly and is
 * only ever rendered when `isDemoMode()` is true.
 */

export interface DemoPersona {
  guestUserId: string
  /** The membership row id — what requests and votes are attributed to. */
  guestId: string
  displayName: string
  isBlocked: boolean
}

function toPersona(guest: EventGuest): DemoPersona {
  return {
    guestUserId: guest.guestUserId,
    guestId: guest.id,
    displayName: guest.displayName,
    isBlocked: guest.isBlocked,
  }
}

/** Everyone who has joined this event, in join order. */
export function listDemoPersonas(eventId: string): DemoPersona[] {
  return getDb()
    .guests.filter((g) => g.eventId === eventId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map(toPersona)
}

/** The persona currently acting, or null if they are not at this event. */
export function getActiveDemoPersona(eventId: string): DemoPersona | null {
  const active = getActiveGuestUserId()
  const guest = getDb().guests.find(
    (g) => g.eventId === eventId && g.guestUserId === active,
  )
  return guest ? toPersona(guest) : null
}

/**
 * Acts as an existing guest from here on. Every "mine" lookup in DemoService
 * re-resolves against this, so requests, votes and the round response all
 * follow immediately.
 */
export function switchDemoPersona(guestUserId: string): void {
  setActiveGuestUserId(guestUserId)
}

/**
 * Creates a new guest at the event and switches to them.
 *
 * Mirrors what `joinEvent` does for a real guest, minus the event code — the
 * switcher already knows which event it is attached to.
 */
export function addDemoPersona(
  eventId: string,
  displayName: string,
): DemoPersona {
  const name = displayName.trim()
  if (!name) {
    throw new ServiceError('invalid_input', 'Give the guest a name.')
  }

  const guestUserId = `demo-guest-${crypto.randomUUID().slice(0, 8)}`

  const guest = mutate(
    (db) => {
      const event = db.events.find((e) => e.id === eventId)
      if (!event) throw new ServiceError('not_found', 'Event not found.')
      if (event.status === 'ended') {
        throw new ServiceError('forbidden', 'This event has ended.')
      }

      const row: EventGuest = {
        id: `demo-guest-row-${crypto.randomUUID().slice(0, 8)}`,
        eventId,
        guestUserId,
        displayName: name,
        isBlocked: false,
        joinedAt: nowIso(),
      }
      db.guests.push(row)
      return row
    },
    channels.event(eventId),
  )

  // Only switch once the row exists, so a failed insert leaves the caller as
  // whoever they already were.
  setActiveGuestUserId(guestUserId)
  return toPersona(guest)
}

/**
 * Fires when the acting guest changes or the roster gains a member. The event
 * channel is included because a guest joining through the normal flow (another
 * tab, the join screen) also changes the list.
 */
export function subscribeDemoRoster(
  eventId: string,
  onChange: () => void,
): Unsubscribe {
  const unsubscribers = [
    subscribe(channels.identity, onChange),
    subscribe(channels.event(eventId), onChange),
  ]
  return () => unsubscribers.forEach((off) => off())
}

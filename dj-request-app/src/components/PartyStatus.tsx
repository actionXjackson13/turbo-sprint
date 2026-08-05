import clsx from 'clsx'
import { useParty } from '../hooks/useParty'
import { canRunPeerParty, isRemoteCode } from '../services/partySession'

/**
 * Whether other phones can actually reach this party right now.
 *
 * The DJ is about to hold a code up to a room, and the single most useful
 * thing to know at that moment is whether it will work. Without a backend the
 * answer genuinely varies — the party is only open while this phone is hosting
 * it, and the sample event is never hosted at all — so it is shown rather than
 * assumed.
 */
export interface PartyStatusProps {
  /** The event this is reporting on. */
  eventId: string
  /** The event's join code, which decides whether it can be hosted. */
  code: string
  className?: string
}

export function PartyStatus({ eventId, code, className }: PartyStatusProps) {
  const { mode, hostedEventId, guestCount, error } = useParty()

  // With Supabase configured the party is always reachable, and this would be
  // noise on every screen it appears on.
  if (!canRunPeerParty()) return null

  const sample = !isRemoteCode(code)
  /**
   * Open *for this event*, not merely hosting something. A DJ with more than
   * one event was previously shown a confident "party is open" over a code
   * nobody was listening on.
   */
  const open = !sample && mode === 'hosting' && hostedEventId === eventId

  return (
    <div
      role="status"
      className={clsx(
        'rounded-control border p-3',
        open
          ? 'border-success-500/40 bg-success-500/10'
          : 'border-status-pending/40 bg-status-pending/10',
        className,
      )}
    >
      <p
        className={clsx(
          'text-label uppercase',
          open ? 'text-success-500' : 'text-status-pending',
        )}
      >
        {sample ? 'Sample event' : open ? 'Party is open' : 'Party is not open'}
      </p>

      <p className="mt-1 text-sm text-fg-muted">
        {sample ? (
          // Every install ships this same event under this same code, so it
          // could never belong to one DJ.
          <>
            This one is for looking around, and stays on this phone. Create your
            own event to invite people.
          </>
        ) : open ? (
          <>
            {guestCount === 0
              ? 'Guests can join with this code. Nobody has connected yet.'
              : `${guestCount} ${guestCount === 1 ? 'phone is' : 'phones are'} connected.`}{' '}
            Keep this app open — the party runs on this phone.
          </>
        ) : (
          (error ??
          'Connecting… if this stays here, check your internet connection.')
        )}
      </p>
    </div>
  )
}

import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { AppButton } from './AppButton'
import { EmptyState } from './EmptyState'
import { LoadingSkeleton } from './LoadingSkeleton'
import { useService } from '../hooks/useService'
import { useLiveData } from '../hooks/useAsyncData'
import { useToast } from '../hooks/useToast'
import { getErrorMessage } from '../utils/errors'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import { haptic } from '../utils/haptics'

export interface GuestManagerProps {
  eventId: string
}

/**
 * Who is at the event, and the only place a block can be undone.
 *
 * Blocking used to be a one-way door: the action existed on a request card,
 * but nothing in the app ever unblocked anyone. A DJ who mis-tapped had
 * silently removed a guest for the rest of the night with no way back and no
 * signal to the guest. Listing everyone makes the state visible and reversible.
 */
export function GuestManager({ eventId }: GuestManagerProps) {
  const service = useService()
  const toast = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const loader = useCallback(
    () => service.listEventGuests(eventId),
    [service, eventId],
  )
  // Blocking writes to event_guests but the app's live channel is requests, so
  // reload explicitly after a change rather than waiting for a broadcast.
  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeSongRequests(eventId, onChange),
    [service, eventId],
  )

  const { data, loading, error, reload } = useLiveData(loader, subscribe)
  const guests = data ?? []

  const toggleBlocked = async (guestId: string, blocked: boolean, name: string) => {
    setPendingId(guestId)
    haptic(blocked ? 'warn' : 'tap')
    try {
      await service.setGuestBlocked(eventId, guestId, blocked)
      await reload()
      toast.success(
        blocked
          ? `${name} can no longer request.`
          : `${name} can request again.`,
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  if (loading && guests.length === 0) {
    return (
      <div className="space-y-2">
        <LoadingSkeleton className="h-14" />
        <LoadingSkeleton className="h-14" />
      </div>
    )
  }

  if (error) {
    return (
      <p role="alert" className="text-meta text-danger-500">
        {error}
      </p>
    )
  }

  if (guests.length === 0) {
    return (
      <EmptyState
        title="Nobody yet"
        description="Guests appear here as they join."
      />
    )
  }

  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-card bg-ink-900">
      {guests.map((guest) => (
        <li
          key={guest.id}
          className="flex items-center gap-3 px-3.5 py-2.5"
        >
          <span
            className={clsx(
              'flex size-9 shrink-0 items-center justify-center rounded-full text-meta font-semibold',
              guest.isBlocked
                ? 'bg-ink-800 text-fg-subtle'
                : 'bg-brand-500/15 text-brand-400',
            )}
            aria-hidden="true"
          >
            {guest.displayName.slice(0, 1).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <p
              className={clsx(
                'text-row truncate font-medium',
                guest.isBlocked ? 'text-fg-subtle line-through' : 'text-fg',
              )}
            >
              {guest.displayName}
            </p>
            <p className="text-meta truncate text-fg-subtle">
              {guest.isBlocked
                ? 'Blocked from requesting'
                : `Joined ${formatRelativeTime(guest.joinedAt)}`}
            </p>
          </div>

          <AppButton
            size="sm"
            variant={guest.isBlocked ? 'secondary' : 'ghost'}
            loading={pendingId === guest.id}
            onClick={() =>
              toggleBlocked(guest.id, !guest.isBlocked, guest.displayName)
            }
          >
            {guest.isBlocked ? 'Unblock' : 'Block'}
          </AppButton>
        </li>
      ))}
    </ul>
  )
}

import { useCallback } from 'react'
import { useService } from '../../hooks/useService'
import { useLiveData } from '../../hooks/useAsyncData'
import { splitQueue } from './queueOrdering'

/**
 * Where each queued song sits, one-based, for the guest who asked for it.
 *
 * "When is my song on?" is the most-asked question at a party, and a guest with
 * no answer asks again — by requesting the same song a second time, or by
 * finding the DJ. Both are worse than a number on a screen.
 *
 * Counted across the whole queue rather than within a half: a guest does not
 * know the queue has halves, and "4th" has to mean fourth from the front or it
 * is a lie. The main half comes first, so a request's position is its index in
 * that half — the backdrop only ever sits behind it.
 */
export function useQueuePositions(eventId: string): Map<string, number> {
  const service = useService()

  const loader = useCallback(
    () => service.listSongRequests(eventId, { statuses: ['queued'] }),
    [service, eventId],
  )
  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeSongRequests(eventId, onChange),
    [service, eventId],
  )

  const { data } = useLiveData(loader, subscribe)

  const { main, sub } = splitQueue(data ?? [])
  return new Map([...main, ...sub].map((r, index) => [r.id, index + 1]))
}

/** "Next up", "2nd", "11th" — the position as a guest would say it. */
export function positionLabel(position: number): string {
  if (position === 1) return 'Next up'

  // 11th, 12th and 13th break the pattern the other teens follow.
  const teens = position % 100
  const suffix =
    teens >= 11 && teens <= 13
      ? 'th'
      : position % 10 === 1
        ? 'st'
        : position % 10 === 2
          ? 'nd'
          : position % 10 === 3
            ? 'rd'
            : 'th'

  return `${position}${suffix} in the queue`
}

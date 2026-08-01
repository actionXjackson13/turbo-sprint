import { ACTIVE_REQUEST_STATUSES, type SongRequest } from '../../types/domain'

/** How many requests a summary list shows before "see all". */
export const REQUEST_LIST_LIMIT = 5

/**
 * The crowd's ranking, shared by the guest event screen and the DJ control
 * panel so the two can never disagree about what is "most wanted".
 *
 * Two rules:
 *
 * - **Only live requests count.** Played and declined ones are finished
 *   business; leaving them in would pin a song the DJ already dealt with to
 *   the top of the list all night.
 * - **Ties break towards the newer request.** The guest screen already
 *   behaved this way, but only as a side effect of sorting a newest-first
 *   list with a stable sort. Stating it here makes the order the same
 *   wherever the list is built, whatever order the caller loaded in.
 */
export function selectMostWanted(
  requests: SongRequest[],
  limit: number = REQUEST_LIST_LIMIT,
): SongRequest[] {
  const live: readonly string[] = ACTIVE_REQUEST_STATUSES
  return requests
    .filter((r) => live.includes(r.status))
    .sort(
      (a, b) =>
        b.voteCount - a.voteCount || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, limit)
}

/**
 * The newest requests, as the room would see them.
 *
 * Declined requests are left out: the guest who sent one is told on their own
 * "Mine" screen, but the DJ turning something down is not news the rest of the
 * party needs a feed of.
 */
export function selectRecent(
  requests: SongRequest[],
  limit: number = REQUEST_LIST_LIMIT,
): SongRequest[] {
  return requests
    .filter((r) => r.status !== 'declined')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

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
 * Two exclusions, for different reasons:
 *
 * - **Declined.** The guest who sent one is told on their own "Mine" screen,
 *   but the DJ turning something down is not news the rest of the party needs
 *   a feed of.
 * - **Played.** These have their own list now — see `selectRecentlyPlayed`.
 *   Leaving them here meant one screen answering two questions at once: a
 *   guest scanning for what has just been asked for had to read past songs
 *   that already happened, and the same song appeared under both headings.
 */
export function selectRecent(
  requests: SongRequest[],
  limit: number = REQUEST_LIST_LIMIT,
): SongRequest[] {
  return requests
    .filter((r) => r.status !== 'declined' && r.status !== 'played')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

/**
 * What the DJ has already played, most recent first.
 *
 * Ordered by `updatedAt` rather than `createdAt`: this list is a history of
 * the *set*, not of the asking. A song requested at the start of the night and
 * played an hour later belongs where it was played, not where it was asked
 * for — and both backends keep `updatedAt` honest when a status changes.
 *
 * The track currently playing is deliberately excluded. Promoting a request to
 * now-playing marks it played, so without this it would head the "recently
 * played" list while still audible, which reads as the app being a step behind
 * the room.
 */
export function selectRecentlyPlayed(
  requests: SongRequest[],
  limit: number = REQUEST_LIST_LIMIT,
  nowPlayingRequestId?: string | null,
): SongRequest[] {
  return requests
    .filter((r) => r.status === 'played' && r.id !== nowPlayingRequestId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

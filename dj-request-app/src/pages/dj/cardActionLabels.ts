import type { RequestStatus } from '../../types/domain'

/**
 * Which actions `CardActions` puts on the card for a given status, so the More
 * sheet can leave them out instead of echoing the buttons above it.
 *
 * Kept apart from the component so that file exports components only, which is
 * what Fast Refresh needs.
 */
export function cardActionLabels(status: RequestStatus): string[] {
  if (status === 'played' || status === 'declined') return ['Reopen']
  if (status === 'queued') return ['Play Next']
  return ['Play Next', 'Add to Queue']
}

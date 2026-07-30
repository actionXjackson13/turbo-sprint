import type { RequestStatus } from '../types/domain'

/** Maximum pending + accepted + queued requests a single guest may hold. */
export const MAX_ACTIVE_REQUESTS_PER_GUEST = 5

/** Length of the shareable join code. */
export const EVENT_CODE_LENGTH = 4

export const MIN_VOTING_OPTIONS = 2
export const MAX_VOTING_OPTIONS = 4

/** Durations offered when the DJ creates a voting round. */
export const VOTING_DURATIONS: ReadonlyArray<{
  label: string
  seconds: number | null
}> = [
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute', seconds: 60 },
  { label: '2 minutes', seconds: 120 },
  { label: 'No auto end', seconds: null },
]

export const FIELD_LIMITS = {
  songTitle: 120,
  artist: 120,
  displayName: 24,
  eventName: 60,
} as const

/** Ordering used when the DJ steps a request through its lifecycle. */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  queued: 'In queue',
  played: 'Played',
  declined: 'Declined',
}

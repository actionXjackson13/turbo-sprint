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

/**
 * How long a DJ's message stays up.
 *
 * Deliberately short options. A message that outlasts the reason for it is
 * just clutter above the thing guests actually opened the app for, and a DJ
 * mid-set will not remember to come back and clear it.
 */
export const ANNOUNCEMENT_DURATIONS: ReadonlyArray<{
  label: string
  seconds: number
}> = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
]

export const FIELD_LIMITS = {
  songTitle: 120,
  artist: 120,
  displayName: 24,
  /**
   * Long enough for anything worth telling a room, short enough that it can
   * never become a second now-playing card. Matches the check in the RPC.
   */
  announcement: 140,
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

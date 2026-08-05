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
 * The one-tap durations for a DJ's message.
 *
 * Three, and all short. These are the answer nearly every time — a message is
 * usually about something happening in the next few minutes — and a row of
 * options wide enough to cover every case would make the common one slower to
 * hit. Everything else lives behind **Custom**.
 */
export const ANNOUNCEMENT_QUICK_DURATIONS: ReadonlyArray<{
  label: string
  seconds: number
}> = [
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '5 min', seconds: 300 },
]

/**
 * The longer options, behind the Custom button.
 *
 * Still a list rather than a free-text field: a DJ picking a duration one-
 * handed mid-set wants to tap, not type, and no party needs a message timed to
 * the second.
 */
export const ANNOUNCEMENT_CUSTOM_DURATIONS: ReadonlyArray<{
  label: string
  seconds: number
}> = [
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1 hour', seconds: 3600 },
  { label: '2 hours', seconds: 7200 },
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

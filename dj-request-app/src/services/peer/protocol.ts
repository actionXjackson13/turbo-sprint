/**
 * What travels over the data channel.
 *
 * Deliberately tiny. A guest does not hold a replica of the party and does not
 * reason about it — it asks the DJ's phone to do something and is told what
 * happened, which is the same relationship the Supabase client has with
 * Postgres. That keeps one implementation of every rule (whether a request is
 * a duplicate, who may vote, what the queue order is) rather than two that
 * have to agree.
 */

/** Guest → host: run this DataService method and tell me the result. */
export interface CallMessage {
  t: 'call'
  /** Correlates the reply. */
  id: number
  method: string
  args: unknown[]
}

/** Host → guest: the result of one call. */
export interface ResultMessage {
  t: 'result'
  id: number
  ok: true
  value: unknown
}

/**
 * Host → guest: the call threw.
 *
 * `kind` carries the ServiceError code across the wire so the guest can
 * rebuild a real ServiceError; the UI branches on those codes (a closed
 * intake reads differently from a block) and would otherwise get a bare
 * string.
 */
export interface ErrorMessage {
  t: 'error'
  id: number
  ok: false
  kind: string
  message: string
}

/** Guest → host, once the channel opens: who is asking. */
export interface HelloMessage {
  t: 'hello'
  guestUserId: string
}

/**
 * Host → guest: something changed, re-read what you are showing.
 *
 * An invalidation rather than a diff. Screens already re-fetch on a Supabase
 * realtime tick, so this reuses that path exactly and cannot drift from it —
 * and a party generates a handful of changes a minute, not a stream.
 */
export interface ChangedMessage {
  t: 'changed'
  /** Which subscription channels to wake, e.g. `requests:<eventId>`. */
  channels: string[]
}

export type PeerMessage =
  | CallMessage
  | ResultMessage
  | ErrorMessage
  | HelloMessage
  | ChangedMessage

export function isPeerMessage(value: unknown): value is PeerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { t?: unknown }).t === 'string'
  )
}

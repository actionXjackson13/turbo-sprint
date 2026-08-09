import type { SongRequest } from '../../types/domain'

/**
 * Who a queued song belongs to, and what that means for its place in the queue.
 *
 * Sets made the queue lopsided. A DJ can now drop thirty songs into it in one
 * tap, and a guest request queued afterwards would land at position thirty-one
 * — two hours away, which is the same as never. The entire point of the app is
 * that the room gets heard, so the arithmetic cannot be left to chance.
 *
 * The rule is one sentence: **a request never queues behind the DJ's own
 * songs.** The set is the floor of the night, not a wall in front of it.
 *
 * It is deliberately a *default*, not a lock. The DJ can still drag anything
 * anywhere afterwards — this only decides where a song lands when nobody has
 * said otherwise, which is the case that was getting it wrong.
 */

/**
 * The DJ's own song: nobody asked for it.
 *
 * Two nulls, and the second one matters. A vote winner also has no guest
 * behind it, but it is the most collective thing in the app — the whole room
 * chose it — so it belongs with the requests, not with the filler.
 */
export function isDjSong(request: SongRequest): boolean {
  return request.guestId === null && request.sourceRoundId === null
}

/** Everything the room asked for: guest requests and vote winners alike. */
export function isRoomSong(request: SongRequest): boolean {
  return !isDjSong(request)
}

function byPosition(a: SongRequest, b: SongRequest): number {
  return (a.queuePosition ?? 0) - (b.queuePosition ?? 0)
}

/**
 * The queue's ids with `requestId` placed at the back of the room's songs and
 * ahead of the DJ's — the position a request would have had if the DJ's filler
 * were not there at all.
 *
 * Pure, so the ordering is testable without a component or a service.
 */
export function queueOrderWithRequestAhead(
  queued: SongRequest[],
  requestId: string,
): string[] {
  const others = queued.filter((r) => r.id !== requestId).sort(byPosition)
  const moving = queued.find((r) => r.id === requestId)

  const room = others.filter(isRoomSong)
  const dj = others.filter(isDjSong)

  return [
    ...room.map((r) => r.id),
    // The song being queued goes here whether or not it is in `queued` yet —
    // the caller may be moving a request that has only just become queued.
    ...(moving || !queued.some((r) => r.id === requestId) ? [requestId] : []),
    ...dj.map((r) => r.id),
  ]
}

/**
 * The whole queue, room first, DJ's own after — the canonical order.
 *
 * `queueOrderWithRequestAhead` fixes the position of one song as it is queued,
 * which only helps on the paths that remember to call it. This states the rule
 * for the entire queue instead, so it can be applied after *any* insert and get
 * the same answer: whatever the room asked for plays before whatever the DJ
 * added to fill the gaps.
 *
 * Relative order inside each group is preserved, so a DJ who drags one request
 * above another, or reorders their own set, keeps that. What it will not keep
 * is filler dragged above a request — which is the point.
 */
export function queueOrderRoomFirst(queued: SongRequest[]): string[] {
  const ordered = [...queued].sort(byPosition)
  return [
    ...ordered.filter(isRoomSong).map((r) => r.id),
    ...ordered.filter(isDjSong).map((r) => r.id),
  ]
}

/**
 * How many of the room's songs are waiting, for the badge that tells the DJ
 * whether they need to look. Filler is not news.
 */
export function countRoomSongs(queued: SongRequest[]): number {
  return queued.filter(isRoomSong).length
}

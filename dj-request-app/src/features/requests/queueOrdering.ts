import type { SongRequest } from '../../types/domain'

/**
 * The queue in two halves.
 *
 * **main** is what plays next. **sub** is the backdrop — where a loaded set
 * lands. New requests join the end of main, so they play ahead of the whole set
 * without ever jumping the queue on requests already waiting.
 *
 * The earlier version derived this: anything with no guest and no vote behind
 * it was filler, and filler sorted last. That rule could be applied but never
 * overridden — a DJ who dragged one of their own songs up watched the next
 * request land above it and their song sink back, because the rule kept
 * recomputing the same answer. Which half a song is in is now a fact stored
 * about the song, so promoting one track out of a set makes it stick.
 *
 * Who *asked* for a song is a separate question from where it plays, and stays
 * separate: `isDjSong` still drives the colour of the row, and a DJ song
 * promoted into main is still visibly the DJ's.
 */

/**
 * The DJ's own song: nobody asked for it.
 *
 * Two nulls, and the second one matters. A vote winner also has no guest behind
 * it, but it is the most collective thing in the app — the whole room chose it
 * — so it reads as the room's, not as filler.
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

export interface SplitQueue {
  /** Plays first. Requests append to the end of this. */
  main: SongRequest[]
  /** The backdrop. A loaded set appends to the end of this. */
  sub: SongRequest[]
}

/** The queue as the DJ sees it: two lists, each in its own order. */
export function splitQueue(queued: SongRequest[]): SplitQueue {
  const ordered = [...queued].sort(byPosition)
  return {
    main: ordered.filter((r) => r.queueGroup !== 'sub'),
    sub: ordered.filter((r) => r.queueGroup === 'sub'),
  }
}

/**
 * The whole queue as one list of ids, main first — the canonical order.
 *
 * Applied after anything lands in the queue, so a song inserted at the very
 * back by the database still ends up at the end of *its own half* rather than
 * behind the backdrop. Relative order inside each half is untouched, which is
 * what lets a manual drag survive.
 */
export function queueOrderMainFirst(queued: SongRequest[]): string[] {
  const { main, sub } = splitQueue(queued)
  return [...main, ...sub].map((r) => r.id)
}

/** How many of the ordered ids belong to main — what `reorderQueue` needs. */
export function mainCountOf(queued: SongRequest[]): number {
  return splitQueue(queued).main.length
}

/**
 * How many of the room's songs are waiting, for the line that tells the DJ
 * whether they need to look. Backdrop is not news.
 */
export function countRoomSongs(queued: SongRequest[]): number {
  return queued.filter(isRoomSong).length
}

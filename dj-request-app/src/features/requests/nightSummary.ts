import { isDjSong } from './queueOrdering'
import type { SongRequest } from '../../types/domain'

/**
 * What the night actually was.
 *
 * A party ends and everything it produced — what played, what the room pushed
 * hardest for, what never made it on — is spread across four filter tabs and
 * then thrown away when the event is ended. This is the record: not analytics,
 * just the handful of facts a DJ would want afterwards, and the ones worth
 * carrying into the next night.
 */

export interface NightSummary {
  played: SongRequest[]
  /** Asked for, never played. The nearest thing to a regret list. */
  missed: SongRequest[]
  /** Most-voted requests, played or not. */
  mostWanted: SongRequest[]
  totalRequests: number
  /** How many of the played songs came from the room rather than the DJ. */
  playedFromRoom: number
  totalVotes: number
}

/** How many of the top-voted to keep. Enough to see the shape of the room. */
const TOP_WANTED = 5

export function buildNightSummary(requests: SongRequest[]): NightSummary {
  const played = requests
    .filter((r) => r.status === 'played')
    // By when they were played, so the list reads as the night ran.
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))

  /**
   * Only the room's songs count as missed. A set song that never came up was
   * backdrop the night did not need, which is not a disappointment — where a
   * request nobody played is the one thing a DJ might genuinely want to know.
   */
  const missed = requests
    .filter((r) => r.status !== 'played' && r.status !== 'declined')
    .filter((r) => !isDjSong(r))
    .sort((a, b) => b.voteCount - a.voteCount)

  const mostWanted = requests
    .filter((r) => !isDjSong(r) && r.voteCount > 0)
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, TOP_WANTED)

  const fromRoom = requests.filter((r) => !isDjSong(r))

  return {
    played,
    missed,
    mostWanted,
    totalRequests: fromRoom.length,
    playedFromRoom: played.filter((r) => !isDjSong(r)).length,
    totalVotes: fromRoom.reduce((sum, r) => sum + r.voteCount, 0),
  }
}

/**
 * The night in one sentence, for the top of the summary.
 *
 * Leads with what the room got, because that is what the app is for — a DJ who
 * played forty songs and none of them requested had a different night from one
 * who played forty of which twelve came from the floor.
 */
export function summaryHeadline(summary: NightSummary): string {
  const { played, playedFromRoom, totalRequests } = summary
  if (played.length === 0) return 'No songs played.'

  const songs = `${played.length} ${played.length === 1 ? 'song' : 'songs'}`
  if (totalRequests === 0) return `${songs} played.`

  return `${songs} played, ${playedFromRoom} of them requested.`
}

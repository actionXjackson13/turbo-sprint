import { ServiceError } from '../types'
import { mapItunesResults, type CatalogSong, type ItunesResult } from './appleCatalog'
import { jsonp } from './jsonp'

/**
 * Apple song ids to actual songs.
 *
 * The playlist importer gets a list of catalogue ids off a playlist page and
 * nothing else — no titles, no artists. This is the other half: Apple's free
 * lookup endpoint, the same one the search box already uses, asked for those
 * ids by number.
 *
 * Titles come from here rather than from the page on purpose. A page is markup
 * that can be laid out differently next month; the catalogue is the thing that
 * actually knows what a song is called, and it is what every other song in this
 * app was named by. Importing through it means an imported song and a searched
 * one are the same kind of object, matching the same way when the player goes
 * looking for it on YouTube.
 */

const ENDPOINT = 'https://itunes.apple.com/lookup'

/**
 * Apple caps a lookup at 200 ids and gets unreliable well before that on a
 * phone connection. Chunks are sequential rather than parallel: this runs once,
 * on a screen that is already showing progress, and hammering a free endpoint
 * from every DJ's phone is how it stops being free.
 */
const CHUNK = 50

interface LookupResponse {
  results?: ItunesResult[]
}

export interface LookupProgress {
  /** Ids resolved so far, out of the total asked for. */
  done: number
  total: number
}

/**
 * Looks up every id, in order, dropping any Apple no longer knows about.
 *
 * Order is the playlist's, not Apple's: a lookup comes back in whatever order
 * it likes, and a DJ's set should open in the order they built it.
 */
export async function lookupAppleSongs(
  songIds: string[],
  onProgress?: (progress: LookupProgress) => void,
): Promise<CatalogSong[]> {
  const ids = [...new Set(songIds.filter((id) => /^\d+$/.test(id)))]
  if (ids.length === 0) return []

  const found = new Map<string, CatalogSong>()

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)

    let body: LookupResponse
    try {
      // JSONP for the same reason the search does it: some phones sit behind a
      // content blocker or DNS filter that kills the fetch but not a script
      // tag, and this is the one request standing between a DJ and their set.
      body = await jsonp<LookupResponse>(ENDPOINT, {
        id: chunk.join(','),
        entity: 'song',
      })
    } catch (err) {
      if (err instanceof ServiceError) throw err
      throw new ServiceError(
        'network',
        'Could not reach Apple to look up the songs. Check your connection and try again.',
      )
    }

    for (const song of mapItunesResults(body.results ?? [])) {
      found.set(song.id, song)
    }

    onProgress?.({ done: Math.min(i + CHUNK, ids.length), total: ids.length })
  }

  return ids
    .map((id) => found.get(id))
    .filter((song): song is CatalogSong => song !== undefined)
}

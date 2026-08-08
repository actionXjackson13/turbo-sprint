import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearVideoCache,
  readCachedMatch,
  writeCachedResolution,
} from '../../src/services/player/videoCache'
import { rejectVideo, resolveVideo } from '../../src/services/player/resolveVideo'
import { setYouTubeKey } from '../../src/services/player/playerSettings'

/**
 * The cache is the only reason in-app playback fits inside YouTube's free tier.
 *
 * A `search.list` call is one of roughly a hundred a day, and that budget does
 * not grow with the party. Without remembering answers, a night that replays a
 * song would buy the same fact twice and a DJ's regulars would cost every time
 * — so "a repeat costs nothing" is a correctness property here, not a
 * performance nicety, and it is what these tests are mostly about.
 */

const song = { title: 'Levitating', artist: 'Dua Lipa' }

const fetchMock = vi.fn()

function respondWith(ids: string[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      items: ids.map((id) => ({
        id: { videoId: id },
        snippet: { title: 'Levitating', channelTitle: 'Dua Lipa - Topic' },
      })),
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setYouTubeKey('test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('paying for a song once', () => {
  it('asks YouTube the first time and never again', async () => {
    respondWith(['first'])

    expect((await resolveVideo(song)).videoId).toBe('first')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Same song, later in the night, or at next week's party.
    expect((await resolveVideo(song)).videoId).toBe('first')
    expect((await resolveVideo(song)).videoId).toBe('first')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats differently-typed spellings as the same song', async () => {
    respondWith(['first'])
    await resolveVideo({ title: 'Don’t Stop Me Now', artist: 'Queen' })

    // One guest's curly apostrophe, another's straight one, a third's none.
    await resolveVideo({ title: "Don't Stop Me Now", artist: 'Queen' })
    await resolveVideo({ title: 'Dont Stop Me Now', artist: 'queen' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /**
   * A key that has been removed, or a quota that is spent, must not take the
   * whole feature down mid-set. Everything the device already knows still plays.
   */
  it('still plays a known song with no key at all', async () => {
    respondWith(['first'])
    await resolveVideo(song)

    setYouTubeKey('')
    expect((await resolveVideo(song)).videoId).toBe('first')

    await expect(
      resolveVideo({ title: 'Something New', artist: 'Nobody' }),
    ).rejects.toMatchObject({ failure: 'no_key' })
  })
})

describe('rejecting a bad pick', () => {
  it('steps to the next candidate without asking YouTube again', async () => {
    respondWith(['first', 'second', 'third'])
    expect((await resolveVideo(song)).videoId).toBe('first')

    expect(rejectVideo(song)?.videoId).toBe('second')
    expect(rejectVideo(song)?.videoId).toBe('third')
    // The whole point: correcting a wrong pick spends no quota.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('remembers the correction for next time', async () => {
    respondWith(['first', 'second'])
    await resolveVideo(song)
    rejectVideo(song)

    expect((await resolveVideo(song)).videoId).toBe('second')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('says so when it has run out of alternatives', async () => {
    respondWith(['only'])
    await resolveVideo(song)

    expect(rejectVideo(song)).toBeNull()
  })

  it('is a no-op for a song that was never looked up', () => {
    expect(rejectVideo({ title: 'Unknown', artist: 'Nobody' })).toBeNull()
  })
})

describe('surviving a damaged cache', () => {
  it('ignores storage that holds something else entirely', () => {
    localStorage.setItem('soundboard.player.videos', 'not json at all')
    expect(readCachedMatch(song)).toBeNull()

    localStorage.setItem('soundboard.player.videos', '["an array"]')
    expect(readCachedMatch(song)).toBeNull()
  })

  it('ignores an entry with no candidates left in it', () => {
    writeCachedResolution(song, { candidates: [], index: 0 })
    expect(readCachedMatch(song)).toBeNull()
  })

  it('can be emptied when a song has learned a wrong answer', async () => {
    respondWith(['first'])
    await resolveVideo(song)

    clearVideoCache()
    respondWith(['corrected'])

    expect((await resolveVideo(song)).videoId).toBe('corrected')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('staying inside the storage budget', () => {
  it('forgets the oldest songs rather than failing to write', () => {
    const match = {
      videoId: 'v',
      videoTitle: 'title',
      channelTitle: 'channel',
    }

    for (let i = 0; i < 250; i++) {
      writeCachedResolution(
        { title: `Song ${i}`, artist: 'Artist' },
        { candidates: [match], index: 0 },
      )
    }

    // The first ones are gone; the recent ones are not.
    expect(readCachedMatch({ title: 'Song 0', artist: 'Artist' })).toBeNull()
    expect(readCachedMatch({ title: 'Song 249', artist: 'Artist' })).not.toBeNull()
  })

  it('keeps a song in use alive by re-writing it', () => {
    const match = { videoId: 'v', videoTitle: 't', channelTitle: 'c' }
    const favourite = { title: 'Favourite', artist: 'Artist' }

    writeCachedResolution(favourite, { candidates: [match], index: 0 })

    for (let i = 0; i < 199; i++) {
      writeCachedResolution(
        { title: `Filler ${i}`, artist: 'Artist' },
        { candidates: [match], index: 0 },
      )
      // Played again, which moves it back to the front of the eviction order.
      writeCachedResolution(favourite, { candidates: [match], index: 0 })
    }

    expect(readCachedMatch(favourite)).not.toBeNull()
  })
})

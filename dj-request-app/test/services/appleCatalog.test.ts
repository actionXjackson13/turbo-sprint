import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchCatalog } from '../../src/services/catalog/appleCatalog'
import { ServiceError } from '../../src/services/types'

/** A trimmed copy of a real iTunes Search API response. */
const body = {
  resultCount: 2,
  results: [
    {
      trackId: 1440649762,
      trackName: 'Mr. Brightside',
      artistName: 'The Killers',
      collectionName: 'Hot Fuss',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/us/album/mr-brightside/1440649728?i=1440649762',
    },
    // Real responses carry rows that are not playable songs; they must not
    // become tappable results with an undefined title.
    { trackId: 999, artistName: 'Nobody' },
  ],
}

function mockFetch(init: Partial<Response> & { json?: () => unknown }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: init.json ?? (() => Promise.resolve(body)),
  } as unknown as Response)
}

afterEach(() => vi.restoreAllMocks())

describe('searchCatalog', () => {
  it('maps a result and upscales the artwork', async () => {
    mockFetch({})
    const [song] = await searchCatalog('mr brightside')

    expect(song).toMatchObject({
      id: '1440649762',
      title: 'Mr. Brightside',
      artist: 'The Killers',
      album: 'Hot Fuss',
    })
    // 100px is soft on a modern phone.
    expect(song!.artworkUrl).toContain('300x300bb')
    expect(song!.catalogUrl).toContain('music.apple.com')
  })

  it('drops rows that are not identifiable songs', async () => {
    mockFetch({})
    expect(await searchCatalog('mr brightside')).toHaveLength(1)
  })

  it('does not call the network for a blank term', async () => {
    const fetchSpy = mockFetch({})
    expect(await searchCatalog('   ')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('explains a rate limit in words a guest can act on', async () => {
    mockFetch({ ok: false, status: 429 })
    await expect(searchCatalog('anything')).rejects.toThrow(
      /busy right now.*type the song in/i,
    )
  })

  it('reports other failures as a service error', async () => {
    mockFetch({ ok: false, status: 500 })
    await expect(searchCatalog('anything')).rejects.toBeInstanceOf(ServiceError)
  })

  it('lets an abort propagate rather than reporting it as a failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('aborted', 'AbortError'),
    )
    await expect(searchCatalog('anything')).rejects.toThrow(DOMException)
  })
})

/**
 * The fallback is the whole point of this module for guests running a
 * blocker: `itunes.apple.com` is on several lists, so for them the first
 * request never completes.
 */
describe('falling back when Apple is unreachable', () => {
  const mbBody = {
    recordings: [
      {
        id: 'mb-1',
        title: 'Mr. Brightside',
        'artist-credit': [{ name: 'The Killers' }],
        releases: [{ title: 'Hot Fuss' }],
      },
      // The same recording again from another release — MusicBrainz lists one
      // row per release, which would otherwise fill the list with duplicates.
      {
        id: 'mb-2',
        title: 'Mr. Brightside',
        'artist-credit': [{ name: 'The Killers' }],
        releases: [{ title: 'Sawdust' }],
      },
    ],
  }

  it('uses MusicBrainz when the Apple request is blocked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('itunes.apple.com')) {
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mbBody),
      } as unknown as Response)
    })

    const songs = await searchCatalog('mr brightside')
    expect(songs).toHaveLength(1)
    expect(songs[0]).toMatchObject({
      title: 'Mr. Brightside',
      artist: 'The Killers',
      artworkUrl: null,
    })
  })

  it('waits out the MusicBrainz rate limit rather than giving up on it', async () => {
    vi.useFakeTimers()
    try {
      let mbCalls = 0
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input)
        if (url.includes('itunes.apple.com')) {
          return Promise.reject(new TypeError('Failed to fetch'))
        }
        mbCalls += 1
        // MusicBrainz allows about one request a second per address, and a
        // party shares one — so the first ask is routinely the one too soon.
        // Failing here would leave the guest with nothing at all.
        if (mbCalls === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
          } as unknown as Response)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mbBody),
        } as unknown as Response)
      })

      const pending = searchCatalog('mr brightside')
      await vi.advanceTimersByTimeAsync(1200)

      expect(await pending).toHaveLength(1)
      expect(mbCalls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports the original failure when neither source answers', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    // Apple's wording, not MusicBrainz's: a thrown fetch is most often the
    // rate limit, whose 429 carries no CORS headers for the browser to show.
    await expect(searchCatalog('anything')).rejects.toThrow(
      /busy right now.*type the song in/i,
    )
  })

  it('does not fall back when the caller aborted', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('aborted', 'AbortError'))

    await expect(searchCatalog('anything')).rejects.toThrow(DOMException)
    // One attempt only: a superseded search must not race the newer one.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('MusicBrainz ranking', () => {
  /**
   * MusicBrainz scores nearly every title match 100, so its own order puts
   * covers above the recording everyone means. Release count is the signal.
   */
  it('ranks the widely released recording above the covers', async () => {
    const recording = (id: string, artist: string, releases: number) => ({
      id,
      title: 'Mr. Brightside',
      'artist-credit': [{ name: artist }],
      releases: Array.from({ length: releases }, () => ({ title: 'X' })),
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('itunes.apple.com')) {
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            recordings: [
              // MusicBrainz returns the covers first.
              recording('a', 'A Cappella Group', 1),
              recording('b', 'Some Cover Band', 1),
              // Split across rows, as the real API does — one per release.
              recording('c', 'The Killers', 3),
              recording('d', 'The Killers', 5),
            ],
          }),
      } as unknown as Response)
    })

    const songs = await searchCatalog('mr brightside')
    expect(songs[0]!.artist).toBe('The Killers')
    // The two Killers rows collapse into one entry.
    expect(songs.filter((s) => s.artist === 'The Killers')).toHaveLength(1)
  })
})

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
    const { songs, source } = await searchCatalog('mr brightside')
    const [song] = songs

    expect(source).toBe('apple')

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
    expect((await searchCatalog('mr brightside')).songs).toHaveLength(1)
  })

  it('does not call the network for a blank term', async () => {
    const fetchSpy = mockFetch({})
    expect((await searchCatalog('   ')).songs).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('explains a rate limit in words a guest can act on', async () => {
    mockFetch({ ok: false, status: 429 })
    // The probe reaches Apple, so this is the network's budget rather than
    // anything wrong with the guest's phone — and is worded that way.
    await expect(searchCatalog('anything')).rejects.toThrow(
      /limiting searches from this network/i,
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

    const { songs, source } = await searchCatalog('mr brightside')
    expect(source).toBe('musicbrainz')
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

      expect((await pending).songs).toHaveLength(1)
      expect(mbCalls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * The failure that made search look permanently broken.
   *
   * `fetch` has no timeout, so a request nobody ever answers — a captive
   * portal, a filtering DNS that drops rather than refuses — left the promise
   * pending for ever. Nothing downstream ran: no fallback, no error, no empty
   * state, just loading skeletons until the guest gave up and typed the song
   * in by hand.
   */
  it('falls back when Apple accepts the request and never answers', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = String(input)
        if (url.includes('itunes.apple.com')) {
          // Never resolves — only the abort signal can end it.
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mbBody),
        } as unknown as Response)
      })

      const pending = searchCatalog('mr brightside')
      // Apple's seven seconds, then the probe's four alongside the fallback.
      await vi.advanceTimersByTimeAsync(15_000)

      const { songs, source } = await pending
      expect(source).toBe('musicbrainz')
      expect(songs).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up on a hung fallback too, rather than hanging with it', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      })

      const pending = searchCatalog('mr brightside')
      // Apple's window, then MusicBrainz's, with room for the 503 retry.
      const settled = expect(pending).rejects.toThrow(/didn’t respond in time/i)
      await vi.advanceTimersByTimeAsync(40_000)
      await settled
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * Telling the two apart is the whole point: a blocked host is the guest's
   * own device refusing and only they can allow it, while a refusal is the
   * venue's address being rate-limited and waiting fixes it. "Could not be
   * reached" sends someone to check WiFi that was never the problem.
   */
  it('names an on-device blocker when the host cannot be reached at all', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('musicbrainz')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mbBody),
        } as unknown as Response)
      }
      // Both the search and the probe are killed before leaving the phone.
      return Promise.reject(new TypeError('Failed to fetch'))
    })

    const { source, appleFailure } = await searchCatalog('mr brightside')
    expect(source).toBe('musicbrainz')
    expect(appleFailure).toBe('blocked')
  })

  it('names a rate limit when the host answers but the search does not', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('musicbrainz')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mbBody),
        } as unknown as Response)
      }
      if (url.includes('robots.txt')) {
        // no-cors: opaque, but it proves the request reached Apple.
        return Promise.resolve({ type: 'opaque', status: 0 } as unknown as Response)
      }
      return Promise.resolve({ ok: false, status: 429 } as unknown as Response)
    })

    const { appleFailure } = await searchCatalog('mr brightside')
    expect(appleFailure).toBe('refused')
  })

  it('says so when the phone is simply offline', async () => {
    const online = vi
      .spyOn(navigator, 'onLine', 'get')
      .mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('musicbrainz')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mbBody),
        } as unknown as Response)
      }
      return Promise.reject(new TypeError('Failed to fetch'))
    })

    const { appleFailure } = await searchCatalog('mr brightside')
    expect(appleFailure).toBe('offline')
    online.mockRestore()
  })

  it('names the cause when neither source answers', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    // Nothing left the phone at all, including the probe — so the guest is
    // told what to check rather than being left with a generic failure.
    await expect(searchCatalog('anything')).rejects.toThrow(
      /blocking Apple’s song search/i,
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

    const { songs } = await searchCatalog('mr brightside')
    expect(songs[0]!.artist).toBe('The Killers')
    // The two Killers rows collapse into one entry.
    expect(songs.filter((s) => s.artist === 'The Killers')).toHaveLength(1)
  })
})

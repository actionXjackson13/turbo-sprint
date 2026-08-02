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
    await expect(searchCatalog('anything')).rejects.toThrow(/Too many searches/)
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

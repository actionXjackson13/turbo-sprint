import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { searchDeezer } from '../../src/services/catalog/deezer'
import { __setJsonp } from '../../src/services/catalog/jsonp'

/**
 * The keyless catalogue that replaced Spotify as the answer to "can we not
 * use Apple". These cover the two things it has to get right: asking in the
 * shape Deezer needs, and collapsing the pile of near-duplicate rows it sends
 * back into something a guest can choose from.
 */

function track(
  id: number,
  title: string,
  artist: string,
  rank: number,
  album = 'An Album',
) {
  return {
    id,
    title,
    rank,
    link: `https://www.deezer.com/track/${id}`,
    artist: { name: artist },
    album: {
      title: album,
      cover_medium: `https://cdn.deezer.test/${id}/250.jpg`,
      cover_big: `https://cdn.deezer.test/${id}/500.jpg`,
    },
  }
}

let lastRequest: {
  endpoint: string
  params: Record<string, string>
  extra?: Record<string, string>
} | null = null

function respond(data: unknown[]) {
  __setJsonp(<T,>(endpoint: string, params: Record<string, string>, options?: { extraParams?: Record<string, string> }) => {
    lastRequest = { endpoint, params, extra: options?.extraParams }
    return Promise.resolve({ data } as T)
  })
}

beforeEach(() => {
  lastRequest = null
})
afterEach(() => __setJsonp(null))

describe('searchDeezer', () => {
  it('asks Deezer for JSONP, which is the only way it answers a browser', async () => {
    respond([track(1, 'Levitating', 'Dua Lipa', 900)])
    await searchDeezer('levitating')

    expect(lastRequest?.endpoint).toContain('api.deezer.com/search')
    expect(lastRequest?.params.q).toBe('levitating')
    // Without this Deezer returns plain JSON, which no browser may read from
    // another origin — it sends no CORS headers at all.
    expect(lastRequest?.extra?.output).toBe('jsonp')
  })

  it('carries artwork, which is the whole reason it beats MusicBrainz', async () => {
    respond([track(1, 'Levitating', 'Dua Lipa', 900, 'Future Nostalgia')])
    const [song] = await searchDeezer('levitating')

    expect(song).toMatchObject({
      id: 'dz:1',
      title: 'Levitating',
      artist: 'Dua Lipa',
      album: 'Future Nostalgia',
    })
    expect(song!.artworkUrl).toBe('https://cdn.deezer.test/1/500.jpg')
    expect(song!.catalogUrl).toContain('deezer.com/track/1')
  })

  it('keeps the most popular of a song’s many appearances', async () => {
    // The single, the album cut, a reissue — the same song three times.
    respond([
      track(1, 'Levitating', 'Dua Lipa', 400, 'Single'),
      track(2, 'Levitating', 'Dua Lipa', 900, 'Future Nostalgia'),
      track(3, 'Levitating', 'Dua Lipa', 100, 'Deluxe'),
    ])

    const songs = await searchDeezer('levitating')
    expect(songs).toHaveLength(1)
    expect(songs[0]!.album).toBe('Future Nostalgia')
  })

  it('puts the most popular song first', async () => {
    respond([
      track(1, 'Levitating', 'Bossa Nova Covers', 560),
      track(2, 'Levitating', 'Dua Lipa', 900),
    ])

    const songs = await searchDeezer('levitating')
    expect(songs.map((s) => s.artist)).toEqual(['Dua Lipa', 'Bossa Nova Covers'])
  })

  it('drops rows that are not identifiable songs', async () => {
    respond([
      track(1, 'Levitating', 'Dua Lipa', 900),
      { id: 2, title: 'No artist' },
      { id: 3, artist: { name: 'No title' } },
    ])

    expect(await searchDeezer('levitating')).toHaveLength(1)
  })

  it('does not call the network for a blank term', async () => {
    respond([track(1, 'x', 'y', 1)])
    expect(await searchDeezer('   ')).toEqual([])
    expect(lastRequest).toBeNull()
  })
})

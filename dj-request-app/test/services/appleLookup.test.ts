import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupAppleSongs } from '../../src/services/catalog/appleLookup'
import { __setJsonp } from '../../src/services/catalog/jsonp'
import { ServiceError } from '../../src/services/types'

/**
 * Turning a playlist's song ids into songs.
 *
 * The importer reads ids off a playlist page and nothing else — the names come
 * from Apple's catalogue, which is what named every other song in this app. So
 * the thing worth defending here is the join: the right songs, in the DJ's
 * order, and a missing one skipped rather than fabricated.
 */

interface Row {
  trackId: number
  trackName: string
  artistName: string
  collectionName?: string
  artworkUrl100?: string
  trackViewUrl?: string
}

const row = (id: number, title: string, artist = 'An Artist'): Row => ({
  trackId: id,
  trackName: title,
  artistName: artist,
  collectionName: 'An Album',
  artworkUrl100: 'https://example.test/a/100x100bb.jpg',
  trackViewUrl: `https://music.apple.com/song/${id}`,
})

/** Answers a lookup with whatever rows the ids map to, in Apple's own order. */
function stubCatalogue(known: Record<string, Row>, calls: string[][] = []) {
  __setJsonp(async <T,>(_endpoint: string, params: Record<string, string>) => {
    const ids = (params.id ?? '').split(',')
    calls.push(ids)
    // Deliberately reversed: Apple does not promise the order you asked in.
    const results = [...ids].reverse().map((id) => known[id]).filter(Boolean)
    return { results } as T
  })
  return calls
}

afterEach(() => {
  __setJsonp(null)
  vi.restoreAllMocks()
})

describe('looking up a playlist’s songs', () => {
  it('returns them in the playlist’s order, not Apple’s', async () => {
    stubCatalogue({
      '1': row(1, 'First'),
      '2': row(2, 'Second'),
      '3': row(3, 'Third'),
    })

    const songs = await lookupAppleSongs(['1', '2', '3'])
    expect(songs.map((s) => s.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('carries the artwork and link a set needs', async () => {
    stubCatalogue({ '1': row(1, 'Only', 'Someone') })

    const [song] = await lookupAppleSongs(['1'])
    expect(song).toMatchObject({
      id: '1',
      title: 'Only',
      artist: 'Someone',
    })
    expect(song!.artworkUrl).toContain('https://example.test/')
    expect(song!.catalogUrl).toContain('music.apple.com')
  })

  /** A playlist can hold a track Apple has since pulled. */
  it('skips a song the catalogue no longer has', async () => {
    stubCatalogue({ '1': row(1, 'Still here'), '3': row(3, 'Also here') })

    const songs = await lookupAppleSongs(['1', '2', '3'])
    expect(songs.map((s) => s.title)).toEqual(['Still here', 'Also here'])
  })

  it('asks for a long playlist in batches', async () => {
    const known: Record<string, Row> = {}
    const ids: string[] = []
    for (let i = 1; i <= 120; i += 1) {
      known[String(i)] = row(i, `Track ${i}`)
      ids.push(String(i))
    }
    const calls = stubCatalogue(known)

    const songs = await lookupAppleSongs(ids)
    expect(songs).toHaveLength(120)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toHaveLength(50)
    expect(calls[2]).toHaveLength(20)
  })

  it('reports progress as it goes', async () => {
    const known: Record<string, Row> = {}
    const ids: string[] = []
    for (let i = 1; i <= 60; i += 1) {
      known[String(i)] = row(i, `Track ${i}`)
      ids.push(String(i))
    }
    stubCatalogue(known)

    const seen: string[] = []
    await lookupAppleSongs(ids, (p) => seen.push(`${p.done}/${p.total}`))
    expect(seen).toEqual(['50/60', '60/60'])
  })

  it('asks once for a song listed twice', async () => {
    const calls = stubCatalogue({ '1': row(1, 'Once') })

    const songs = await lookupAppleSongs(['1', '1', '1'])
    expect(songs).toHaveLength(1)
    expect(calls[0]).toEqual(['1'])
  })

  it('ignores anything that is not an id', async () => {
    const calls = stubCatalogue({ '7': row(7, 'Real') })

    const songs = await lookupAppleSongs(['7', 'nonsense', '', '../etc'])
    expect(calls[0]).toEqual(['7'])
    expect(songs).toHaveLength(1)
  })

  it('does not call out at all for an empty playlist', async () => {
    const calls = stubCatalogue({})
    expect(await lookupAppleSongs([])).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('explains a lookup that could not reach Apple', async () => {
    __setJsonp(() => Promise.reject(new Error('offline')))

    await expect(lookupAppleSongs(['1'])).rejects.toBeInstanceOf(ServiceError)
    await expect(lookupAppleSongs(['1'])).rejects.toThrow(/could not reach apple/i)
  })
})

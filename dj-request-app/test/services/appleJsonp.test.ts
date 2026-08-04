import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchAppleJsonp } from '../../src/services/catalog/appleJsonp'
import { ServiceError } from '../../src/services/types'

/**
 * The transport that exists because CORS keeps refusing perfectly good
 * responses. jsdom will not load a real external script, so these drive the
 * mechanism directly: append a script, find the callback name Apple is being
 * asked to call, and call it.
 */

const payload = {
  resultCount: 2,
  results: [
    {
      trackId: 1440649762,
      trackName: 'Mr. Brightside',
      artistName: 'The Killers',
      collectionName: 'Hot Fuss',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/us/album/x/1?i=2',
    },
    // Not a playable song; must not become a tappable row.
    { trackId: 999, artistName: 'Nobody' },
  ],
}

/** Runs `onScript` as soon as the transport appends its script tag. */
function whenScriptAppended(onScript: (script: HTMLScriptElement) => void) {
  const original = document.head.appendChild.bind(document.head)
  vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
    const result = original(node)
    if (node instanceof HTMLScriptElement) queueMicrotask(() => onScript(node))
    return result
  })
}

function callbackNameFrom(script: HTMLScriptElement): string {
  return new URL(script.src).searchParams.get('callback')!
}

/** Plays Apple's part: invoke the callback the transport registered. */
function answer(name: string, value: unknown): void {
  const fn = (window as unknown as Record<string, unknown>)[name]
  if (typeof fn !== 'function') throw new Error(`no callback named ${name}`)
  ;(fn as (v: unknown) => void)(value)
}

afterEach(() => vi.restoreAllMocks())

describe('searchAppleJsonp', () => {
  it('asks Apple to call back, and maps what it sends', async () => {
    whenScriptAppended((script) => {
      const name = callbackNameFrom(script)
      expect(script.src).toContain('itunes.apple.com/search')
      expect(script.src).toContain('term=mr+brightside')
      answer(name, payload)
    })

    const songs = await searchAppleJsonp('mr brightside')

    expect(songs).toHaveLength(1)
    expect(songs[0]).toMatchObject({
      id: '1440649762',
      title: 'Mr. Brightside',
      artist: 'The Killers',
      album: 'Hot Fuss',
    })
    // The same upscaling the fetch path does — this is the artwork the guest
    // sees, and it is the whole reason Apple is worth this much trouble.
    expect(songs[0]!.artworkUrl).toContain('300x300bb')
    expect(songs[0]!.catalogUrl).toContain('music.apple.com')
  })

  it('cleans up after itself so nothing is left on the page', async () => {
    let name = ''
    whenScriptAppended((script) => {
      name = callbackNameFrom(script)
      answer(name, payload)
    })

    await searchAppleJsonp('mr brightside')

    expect(name).not.toBe('')
    expect(name in window).toBe(false)
    expect(document.querySelector(`script[src*="${name}"]`)).toBeNull()
  })

  it('reports a refusal when the script will not load', async () => {
    whenScriptAppended((script) => script.onerror?.(new Event('error')))

    await expect(searchAppleJsonp('mr brightside')).rejects.toBeInstanceOf(
      ServiceError,
    )
  })

  it('gives up rather than waiting on a script nobody answers', async () => {
    vi.useFakeTimers()
    try {
      // Appended and then silence — no load event, no error event.
      whenScriptAppended(() => {})

      const pending = searchAppleJsonp('mr brightside')
      const settled = expect(pending).rejects.toThrow(/didn’t respond in time/i)
      await vi.advanceTimersByTimeAsync(8_000)
      await settled
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the caller supersede it', async () => {
    const controller = new AbortController()
    whenScriptAppended(() => controller.abort())

    await expect(
      searchAppleJsonp('mr brightside', { signal: controller.signal }),
    ).rejects.toThrow(DOMException)
  })
})

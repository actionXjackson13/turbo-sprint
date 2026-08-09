import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoAccept } from '../../src/features/requests/useAutoAccept'
import type { SongRequest } from '../../src/types/domain'

/**
 * Queueing every request without being asked.
 *
 * The whole risk here is the loop. Queueing a request triggers a reload, the
 * reload re-runs the watcher, and for a moment the same request is still
 * pending — so without a record of what has already been sent this is an
 * unbounded run of writes rather than a queue. On a party's live connection
 * that is not a slow feature, it is a broken one.
 */

let seq = 0

function request(overrides: Partial<SongRequest> = {}): SongRequest {
  seq += 1
  return {
    id: `r${seq}`,
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title: `Song ${seq}`,
    artist: 'Artist',
    voteCount: 1,
    status: 'pending',
    queuePosition: null,
    queueGroup: 'main',
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** Nothing is blocked in these tests unless a test says so. */
const decline = vi.fn(async () => {})

beforeEach(() => {
  localStorage.clear()
  seq = 0
  decline.mockClear()
})

describe('while it is off', () => {
  it('queues nothing', async () => {
    const queue = vi.fn(async () => {})
    renderHook(() => useAutoAccept('event-1', [request(), request()], queue, decline))

    await new Promise((r) => setTimeout(r, 20))
    expect(queue).not.toHaveBeenCalled()
  })

  it('starts off, and remembers being turned on', async () => {
    const queue = vi.fn(async () => {})
    const { result, unmount } = renderHook(() =>
      useAutoAccept('event-1', [], queue, decline),
    )

    expect(result.current.on).toBe(false)
    act(() => result.current.setOn(true))
    unmount()

    const second = renderHook(() => useAutoAccept('event-1', [], queue, decline))
    expect(second.result.current.on).toBe(true)
  })

  it('is remembered per event, not for every party at once', () => {
    const queue = vi.fn(async () => {})
    const first = renderHook(() => useAutoAccept('event-1', [], queue, decline))
    act(() => first.result.current.setOn(true))

    const other = renderHook(() => useAutoAccept('event-2', [], queue, decline))
    expect(other.result.current.on).toBe(false)
  })
})

describe('while it is on', () => {
  it('queues everything waiting', async () => {
    const queue = vi.fn(async () => {})
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    const waiting = [request(), request(), request()]
    renderHook(() => useAutoAccept('event-1', waiting, queue, decline))

    await waitFor(() => expect(queue).toHaveBeenCalledTimes(3))
  })

  it('takes accepted requests too, not only new ones', async () => {
    const queue = vi.fn(async () => {})
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    renderHook(() =>
      useAutoAccept('event-1', [request({ status: 'accepted' })], queue, decline),
    )

    await waitFor(() => expect(queue).toHaveBeenCalledTimes(1))
  })

  it('leaves alone what is already queued, played or declined', async () => {
    const queue = vi.fn(async () => {})
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    renderHook(() =>
      useAutoAccept(
        'event-1',
        [
          request({ status: 'queued' }),
          request({ status: 'played' }),
          request({ status: 'declined' }),
        ],
        queue,
        decline,
      ),
    )

    await new Promise((r) => setTimeout(r, 30))
    expect(queue).not.toHaveBeenCalled()
  })

  /**
   * The one that matters. The list is handed back unchanged — exactly what a
   * reload looks like before the write has landed — and the request must not be
   * sent a second time.
   */
  it('does not re-queue a request when the list comes back unchanged', async () => {
    const queue = vi.fn(async () => {})
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    const stubborn = [request()]
    const { rerender } = renderHook(
      ({ list }) => useAutoAccept('event-1', list, queue, decline),
      { initialProps: { list: stubborn } },
    )

    await waitFor(() => expect(queue).toHaveBeenCalledTimes(1))

    for (let i = 0; i < 5; i++) {
      rerender({ list: [...stubborn] })
      await new Promise((r) => setTimeout(r, 10))
    }

    expect(queue).toHaveBeenCalledTimes(1)
  })

  it('picks up a request that arrives later', async () => {
    const queue = vi.fn(async () => {})
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    const first = request()
    const { rerender } = renderHook(
      ({ list }) => useAutoAccept('event-1', list, queue, decline),
      { initialProps: { list: [first] } },
    )
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(1))

    const late = request()
    rerender({ list: [first, late] })
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2))
    expect(queue).toHaveBeenLastCalledWith(late)
  })

  /**
   * A failure must not poison the request forever. The retry is deliberately
   * delayed — long enough to outlast a blip — so this waits past that backoff
   * rather than the default second.
   */
  it('retries one that failed, after backing off', async () => {
    const queue = vi
      .fn<(r: SongRequest) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    const stuck = [request()]
    const { rerender } = renderHook(
      ({ list }) => useAutoAccept('event-1', list, queue, decline),
      { initialProps: { list: stuck } },
    )
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(1))

    rerender({ list: [...stuck] })
    await waitFor(() => expect(queue).toHaveBeenCalledTimes(2), {
      timeout: 6_000,
    })
  }, 10_000)

  /**
   * The bug this shipped with. Queueing triggers a reload, so the waiting list
   * changes after the *first* song — and the effect that started the sweep was
   * also the one being torn down by that change, cancelling its own loop while
   * the re-run found `busy` still set and did nothing. One song queued, then
   * silence until the screen was reopened.
   *
   * Simulated the way it actually happened: each queueing removes the request
   * from the list the watcher can see, exactly as a reload would.
   */
  it('drains the whole backlog, not just the first song', async () => {
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')

    let list = [request(), request(), request(), request()]
    let render: () => void = () => {}

    const queue = vi.fn(async (r: SongRequest) => {
      list = list.filter((x) => x.id !== r.id)
      // The reload landing mid-sweep, which is what used to kill it.
      render()
    })

    const { rerender } = renderHook(
      ({ items }) => useAutoAccept('event-1', items, queue, decline),
      { initialProps: { items: list } },
    )
    render = () => rerender({ items: list })

    await waitFor(() => expect(queue).toHaveBeenCalledTimes(4))
    expect(list).toHaveLength(0)
  })

  it('keeps taking requests that arrive one at a time', async () => {
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')
    const queue = vi.fn(async () => {})

    const items: SongRequest[] = []
    const { rerender } = renderHook(
      ({ list }) => useAutoAccept('event-1', list, queue, decline),
      { initialProps: { list: items as SongRequest[] } },
    )

    for (let i = 0; i < 3; i++) {
      items.push(request())
      rerender({ list: [...items] })
      await waitFor(() => expect(queue).toHaveBeenCalledTimes(i + 1))
    }
  })

  /**
   * The blocklist is what makes leaving this switch on safe: without it,
   * "accept everything" really does mean everything.
   */
  it('declines a blocked song instead of queueing it', async () => {
    localStorage.setItem('soundboard.autoAccept.event-1', 'true')
    localStorage.setItem(
      'soundboard.blocklist',
      JSON.stringify([{ text: 'Baby Shark', key: 'baby shark' }]),
    )
    const queue = vi.fn(async () => {})

    const banned = request({ title: 'Baby Shark (Dance Remix)' })
    renderHook(() => useAutoAccept('event-1', [banned], queue, decline))

    await waitFor(() => expect(decline).toHaveBeenCalledTimes(1))
    expect(decline).toHaveBeenCalledWith(banned)
    expect(queue).not.toHaveBeenCalled()
  })

  it('stops as soon as it is switched off', async () => {
    const queue = vi.fn(async () => {})
    const { result, rerender } = renderHook(
      ({ list }) => useAutoAccept('event-1', list, queue, decline),
      { initialProps: { list: [] as SongRequest[] } },
    )

    act(() => result.current.setOn(true))
    act(() => result.current.setOn(false))

    rerender({ list: [request(), request()] })
    await new Promise((r) => setTimeout(r, 30))
    expect(queue).not.toHaveBeenCalled()
  })
})

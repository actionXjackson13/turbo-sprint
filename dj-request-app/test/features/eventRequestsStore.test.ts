import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetEventRequests,
  getEventRequestsSnapshot,
  reloadEventRequests,
  reloadEventRequestsIfStale,
  selectRequests,
  subscribeEventRequests,
} from '../../src/features/requests/eventRequestsStore'
import type { DataService } from '../../src/services/types'
import type { SongRequest } from '../../src/types/domain'

/**
 * One copy of the list, however many screens want it.
 *
 * Measured before this existed: opening the DJ's control panel made twelve
 * calls to the backend and six were exact duplicates fired in the same tick —
 * three screens each loading the request list, each dragging a votes lookup
 * along with it. Every call site was asking a reasonable question; there was
 * simply nowhere for the answer to live.
 *
 * The other half of the job is what happens when a screen goes away. Keeping
 * the rows is what stops every tab switch opening on a skeleton, and not
 * re-fetching them straight back is what stops the saving being given away
 * again.
 */

let seq = 0
function request(overrides: Partial<SongRequest> = {}): SongRequest {
  seq += 1
  return {
    id: `r${seq}`,
    eventId: 'e1',
    guestId: 'g1',
    guestDisplayName: 'Guest',
    title: 'Levitating',
    artist: 'Dua Lipa',
    voteCount: 0,
    status: 'queued',
    queuePosition: seq,
    queueGroup: 'main',
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
    createdAt: new Date(2024, 0, seq).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

let listSongRequests: ReturnType<typeof vi.fn>
let getMyRequestVotes: ReturnType<typeof vi.fn>
let unsubscribe: ReturnType<typeof vi.fn>
let service: DataService

function makeService(rows: SongRequest[] = []) {
  listSongRequests = vi.fn(async () => rows)
  getMyRequestVotes = vi.fn(async () => [] as string[])
  unsubscribe = vi.fn()
  return {
    listSongRequests,
    getMyRequestVotes,
    subscribeSongRequests: vi.fn(() => unsubscribe),
  } as unknown as DataService
}

beforeEach(() => {
  __resetEventRequests()
  service = makeService([request(), request({ voteCount: 5 })])
})

afterEach(() => {
  __resetEventRequests()
  vi.useRealTimers()
})

describe('the shared request list', () => {
  it('loads once for however many screens are watching', async () => {
    const off1 = subscribeEventRequests(service, 'e1', () => {})
    const off2 = subscribeEventRequests(service, 'e1', () => {})
    const off3 = subscribeEventRequests(service, 'e1', () => {})
    await reloadEventRequests(service, 'e1')

    expect(listSongRequests).toHaveBeenCalledTimes(1)
    expect(getMyRequestVotes).toHaveBeenCalledTimes(1)

    off1()
    off2()
    off3()
  })

  /** Simultaneous callers join the request already going out. */
  it('folds concurrent reloads into one request', async () => {
    const off = subscribeEventRequests(service, 'e1', () => {})
    await Promise.all([
      reloadEventRequests(service, 'e1'),
      reloadEventRequests(service, 'e1'),
      reloadEventRequests(service, 'e1'),
    ])

    expect(listSongRequests).toHaveBeenCalledTimes(1)
    off()
  })

  it('tells every watcher when the rows land', async () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeEventRequests(service, 'e1', a)
    const offB = subscribeEventRequests(service, 'e1', b)

    await reloadEventRequests(service, 'e1')

    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
    expect(getEventRequestsSnapshot(service, 'e1').data?.requests).toHaveLength(2)
    offA()
    offB()
  })

  it('opens one live subscription, not one per screen', async () => {
    const off1 = subscribeEventRequests(service, 'e1', () => {})
    const off2 = subscribeEventRequests(service, 'e1', () => {})

    expect(service.subscribeSongRequests).toHaveBeenCalledTimes(1)

    off1()
    expect(unsubscribe).not.toHaveBeenCalled()
    off2()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  /**
   * The bug this prevents: every tab switch opening on a skeleton, because the
   * rows were thrown away the instant the last screen unmounted.
   */
  it('keeps the rows when the last screen goes away', async () => {
    const off = subscribeEventRequests(service, 'e1', () => {})
    await reloadEventRequests(service, 'e1')
    off()

    expect(getEventRequestsSnapshot(service, 'e1').data?.requests).toHaveLength(2)
  })

  it('does not re-fetch rows it only just loaded', async () => {
    const off = subscribeEventRequests(service, 'e1', () => {})
    await reloadEventRequests(service, 'e1')
    off()

    reloadEventRequestsIfStale(service, 'e1')
    expect(listSongRequests).toHaveBeenCalledTimes(1)
  })

  it('does re-fetch rows old enough to doubt', async () => {
    vi.useFakeTimers()
    const off = subscribeEventRequests(service, 'e1', () => {})
    await reloadEventRequests(service, 'e1')
    off()

    vi.advanceTimersByTime(20_000)
    reloadEventRequestsIfStale(service, 'e1')
    expect(listSongRequests).toHaveBeenCalledTimes(2)
  })

  /** A refresh behind a list already on screen must not blank it. */
  it('only reports loading when it has nothing to show', async () => {
    const off = subscribeEventRequests(service, 'e1', () => {})
    expect(getEventRequestsSnapshot(service, 'e1').loading).toBe(true)

    await reloadEventRequests(service, 'e1')
    expect(getEventRequestsSnapshot(service, 'e1').loading).toBe(false)

    const second = reloadEventRequests(service, 'e1')
    expect(getEventRequestsSnapshot(service, 'e1').loading).toBe(false)
    await second
    off()
  })

  it('keeps two backends apart', async () => {
    const other = makeService([request()])
    const offA = subscribeEventRequests(service, 'e1', () => {})
    const offB = subscribeEventRequests(other, 'e1', () => {})
    await Promise.all([
      reloadEventRequests(service, 'e1'),
      reloadEventRequests(other, 'e1'),
    ])

    expect(getEventRequestsSnapshot(service, 'e1').data?.requests).toHaveLength(2)
    expect(getEventRequestsSnapshot(other, 'e1').data?.requests).toHaveLength(1)
    offA()
    offB()
  })

  it('reports a failure instead of hanging', async () => {
    const broken = makeService()
    ;(broken.listSongRequests as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('offline'),
    )
    const off = subscribeEventRequests(broken, 'e1', () => {})
    await reloadEventRequests(broken, 'e1')

    // The wording is `getErrorMessage`'s job — what matters here is that a
    // failure is recorded rather than leaving the screen loading forever.
    expect(getEventRequestsSnapshot(broken, 'e1').error).toBeTruthy()
    expect(getEventRequestsSnapshot(broken, 'e1').loading).toBe(false)
    off()
  })
})

describe('shaping the shared list', () => {
  it('puts the newest first by default', () => {
    const older = request({ createdAt: '2024-01-01T00:00:00Z' })
    const newer = request({ createdAt: '2024-06-01T00:00:00Z' })

    expect(selectRequests([older, newer]).map((r) => r.id)).toEqual([
      newer.id,
      older.id,
    ])
  })

  it('puts the most wanted first when asked', () => {
    const quiet = request({ voteCount: 1 })
    const loud = request({ voteCount: 9 })

    expect(
      selectRequests([quiet, loud], { sort: 'votes' }).map((r) => r.id),
    ).toEqual([loud.id, quiet.id])
  })

  it('breaks a tie on votes with the newer song', () => {
    const older = request({ voteCount: 3, createdAt: '2024-01-01T00:00:00Z' })
    const newer = request({ voteCount: 3, createdAt: '2024-06-01T00:00:00Z' })

    expect(
      selectRequests([older, newer], { sort: 'votes' }).map((r) => r.id),
    ).toEqual([newer.id, older.id])
  })

  it('filters to the statuses asked for', () => {
    const queued = request({ status: 'queued' })
    const pending = request({ status: 'pending' })
    const declined = request({ status: 'declined' })

    const shown = selectRequests([queued, pending, declined], {
      statuses: ['pending'],
    })
    expect(shown.map((r) => r.id)).toEqual([pending.id])
  })

  /** Every screen holds the same array; one sorting it must not reorder another's. */
  it('never reorders the shared array', () => {
    const rows = [request({ voteCount: 1 }), request({ voteCount: 9 })]
    const before = rows.map((r) => r.id)

    selectRequests(rows, { sort: 'votes' })

    expect(rows.map((r) => r.id)).toEqual(before)
  })
})

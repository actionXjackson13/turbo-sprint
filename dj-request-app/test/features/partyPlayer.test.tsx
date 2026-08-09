import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducer } from 'react'
import type { SongRequest } from '../../src/types/domain'
import { PlayerError } from '../../src/services/player/youtubeSearch'

/**
 * The queue playing itself.
 *
 * Everything here is about what happens *between* songs, which is the part with
 * no second chance: a party notices silence, and it notices the same song twice.
 * The awkward cases are all timing — a song ending while the DJ is on another
 * screen, a guest queueing something after playback started, a run of songs
 * that cannot be found — and none of them are reachable by clicking around.
 */

const store = { requests: [] as SongRequest[] }
let forceReload: (() => void) | null = null

/** Options the player hook was constructed with, so tests can fire its events. */
let playerEvents: { onEnded: () => void; onUnplayable: (code: number) => void }
const play = vi.fn()
const stop = vi.fn()

const setNowPlaying = vi.fn(async (_eventId: string, nowPlaying: unknown) => {
  // The real service retires the request from the queue as it promotes it.
  const id = (nowPlaying as { sourceRequestId: string }).sourceRequestId
  store.requests = store.requests.filter((r) => r.id !== id)
  return undefined
})

const toastError = vi.fn()

const resolveVideo = vi.fn()
const rejectVideo = vi.fn()

/** The happy path, restored between tests so a rejection cannot leak forward. */
function resolvesNormally() {
  resolveVideo.mockImplementation(async (song: { title: string }) => ({
    videoId: `video-for-${song.title}`,
    videoTitle: song.title,
    channelTitle: 'Topic',
  }))
}

vi.mock('../../src/hooks/useService', () => ({
  useService: () => ({ setNowPlaying }),
}))

vi.mock('../../src/hooks/useDjEvent', () => ({
  useDjEvent: () => ({ refresh: async () => {} }),
}))

vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn() }),
}))

vi.mock('../../src/features/requests/useEventRequests', () => ({
  useEventRequests: () => {
    const [, bump] = useReducer((n: number) => n + 1, 0)
    forceReload = bump
    return {
      requests: store.requests,
      myVotes: new Set<string>(),
      loading: false,
      error: null,
      reload: async () => bump(),
      pendingVotes: new Set<string>(),
      toggleVote: async () => {},
    }
  },
}))

vi.mock('../../src/features/player/useYouTubePlayer', () => ({
  useYouTubePlayer: (opts: typeof playerEvents) => {
    playerEvents = opts
    return {
      hostRef: { current: null },
      ready: true,
      loadError: null,
      playing: true,
      play,
      pause: vi.fn(),
      resume: vi.fn(),
      stop,
    }
  },
}))

vi.mock('../../src/services/player/resolveVideo', () => ({
  resolveVideo: (song: { title: string }) => resolveVideo(song),
  rejectVideo: () => rejectVideo(),
}))

const { usePartyPlayer } = await import(
  '../../src/features/player/usePartyPlayer'
)

function request(id: string, title: string, position: number): SongRequest {
  return {
    id,
    eventId: 'event-1',
    guestId: 'guest-1',
    guestDisplayName: 'Guest',
    title,
    artist: 'Artist',
    voteCount: 0,
    status: 'queued',
    queuePosition: position,
    queueGroup: 'main',
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  store.requests = [
    request('r1', 'First', 0),
    request('r2', 'Second', 1),
    request('r3', 'Third', 2),
  ]
  forceReload = null
  play.mockClear()
  stop.mockClear()
  setNowPlaying.mockClear()
  toastError.mockClear()
  // Reset, not clear: a `mockRejectedValue` set by one test would otherwise
  // stay the implementation for every test after it.
  resolveVideo.mockReset()
  resolvesNormally()
  rejectVideo.mockReset()
  rejectVideo.mockReturnValue(null)
})

describe('the phone’s lock screen', () => {
  /**
   * iOS has one "Now Playing" slot and gives it to whichever app touched audio
   * last. Open Apple Music mid-set and it keeps that slot even while paused, so
   * the lock screen's play button resumes *Apple Music* while the party's queue
   * sits silent. Registering here is what claims it back — and the handlers
   * have to reach the live player, since they are pressed long after the render
   * that installed them.
   */
  const handlers = new Map<string, () => void>()
  const metadata: unknown[] = []

  beforeEach(() => {
    handlers.clear()
    metadata.length = 0
    vi.stubGlobal('MediaMetadata', class {
      constructor(init: unknown) {
        metadata.push(init)
      }
    })
    Object.defineProperty(navigator, 'mediaSession', {
      value: {
        playbackState: 'none',
        set metadata(v: unknown) {
          if (v) metadata.push(v)
        },
        get metadata() {
          return null
        },
        setActionHandler: (action: string, fn: (() => void) | null) => {
          if (fn) handlers.set(action, fn)
          else handlers.delete(action)
        },
      },
      configurable: true,
    })
  })

  it('tells the lock screen which song is on', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    expect(metadata).toContainEqual(
      expect.objectContaining({ title: 'First', artist: 'Artist' }),
    )
  })

  it('routes the lock screen’s pause to this player, not another app', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => handlers.get('pause')!())
    expect(result.current.status).toBe('paused')

    await act(async () => handlers.get('play')!())
    expect(result.current.status).toBe('playing')
  })

  it('advances the queue from the lock screen’s skip button', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => handlers.get('nexttrack')!())

    await waitFor(() => expect(result.current.current?.id).toBe('r2'))
  })

  /** A dead transport pointing at a finished party is worse than none. */
  it('hands the slot back when the queue runs dry', async () => {
    store.requests = [request('r1', 'Only', 0)]
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => playerEvents.onEnded())

    await waitFor(() => expect(result.current.status).toBe('empty'))
    expect(handlers.size).toBe(0)
  })
})

describe('starting the queue', () => {
  it('plays the song at the front and tells the guests', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))

    await act(async () => result.current.start())

    await waitFor(() => expect(result.current.status).toBe('playing'))
    expect(result.current.current?.id).toBe('r1')
    expect(play).toHaveBeenCalledWith('video-for-First')
    // The same write the manual button makes, so guest screens update for free.
    expect(setNowPlaying).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ sourceRequestId: 'r1', title: 'First' }),
    )
  })

  it('says the queue is empty rather than pretending to play', async () => {
    store.requests = []
    const { result } = renderHook(() => usePartyPlayer('event-1'))

    await act(async () => result.current.start())

    expect(result.current.status).toBe('empty')
    expect(play).not.toHaveBeenCalled()
  })

  /** A song that cannot be found must never be announced as playing. */
  it('does not announce a song it could not resolve', async () => {
    resolveVideo.mockRejectedValueOnce(
      new PlayerError('key_rejected', 'bad key'),
    )
    const { result } = renderHook(() => usePartyPlayer('event-1'))

    await act(async () => result.current.start())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(setNowPlaying).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
})

describe('advancing by itself', () => {
  it('moves to the next song when one ends', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => playerEvents.onEnded())

    await waitFor(() => expect(result.current.current?.id).toBe('r2'))
    expect(play).toHaveBeenLastCalledWith('video-for-Second')
  })

  /**
   * The end-of-song event fires outside React's render cycle, from a closure
   * created when the *previous* song started. Reading a stale queue here would
   * silently drop anything queued during the song that just played.
   */
  it('picks up a song queued while the previous one was playing', async () => {
    store.requests = [request('r1', 'First', 0)]
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    // A guest asks for something mid-song.
    await act(async () => {
      store.requests = [request('late', 'Late Arrival', 0)]
      forceReload?.()
    })

    await act(async () => playerEvents.onEnded())

    await waitFor(() => expect(result.current.current?.id).toBe('late'))
  })

  it('stops when the queue runs dry', async () => {
    store.requests = [request('r1', 'Only', 0)]
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => playerEvents.onEnded())

    await waitFor(() => expect(result.current.status).toBe('empty'))
    expect(result.current.current).toBeNull()
  })
})

describe('when songs cannot be played', () => {
  /** Silence is worse than a gap, so one missing song does not stop the night. */
  it('skips past a song that is not on YouTube', async () => {
    resolveVideo.mockRejectedValueOnce(
      new PlayerError('not_found', 'not on youtube'),
    )
    const { result } = renderHook(() => usePartyPlayer('event-1'))

    await act(async () => result.current.start())

    await waitFor(() => expect(result.current.current?.id).toBe('r2'))
    expect(result.current.status).toBe('playing')
    expect(toastError).toHaveBeenCalled()
  })

  /**
   * A dead key or a spent quota fails every song equally. Skipping the whole
   * queue one failure at a time — marking each played on the way — would be the
   * worst possible response, so automatic recovery has a floor.
   */
  it('gives up rather than burning through the whole queue', async () => {
    resolveVideo.mockRejectedValue(new PlayerError('not_found', 'nope'))
    const { result } = renderHook(() => usePartyPlayer('event-1'))

    await act(async () => result.current.start())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.failure).toContain('could not be played')
    // Not every song in the queue was consumed.
    expect(setNowPlaying).not.toHaveBeenCalled()
  })

  it('tries the next candidate when a video refuses to embed', async () => {
    rejectVideo.mockReturnValue({ videoId: 'fallback' })
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => playerEvents.onUnplayable(150))

    expect(play).toHaveBeenLastCalledWith('fallback')
    // Still the same song — a different video of it.
    expect(result.current.current?.id).toBe('r1')
  })

  it('moves on when there are no other candidates to try', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => playerEvents.onUnplayable(150))

    await waitFor(() => expect(result.current.current?.id).toBe('r2'))
  })
})

describe('the DJ taking over', () => {
  it('skips to the next song on demand', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => result.current.skip())

    await waitFor(() => expect(result.current.current?.id).toBe('r2'))
    expect(stop).toHaveBeenCalled()
  })

  it('swaps the video without changing the song', async () => {
    rejectVideo.mockReturnValue({ videoId: 'a-better-take' })
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => result.current.wrongSong())

    expect(play).toHaveBeenLastCalledWith('a-better-take')
    expect(result.current.current?.id).toBe('r1')
    // Correcting a pick must not re-announce the song to the guests.
    expect(setNowPlaying).toHaveBeenCalledTimes(1)
  })

  it('says so when there is no other version to try', async () => {
    const { result } = renderHook(() => usePartyPlayer('event-1'))
    await act(async () => result.current.start())
    await waitFor(() => expect(result.current.status).toBe('playing'))

    await act(async () => result.current.wrongSong())

    expect(toastError).toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
  })
})

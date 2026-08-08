/**
 * Loading YouTube's embedded player.
 *
 * This is the free half of in-app playback, and worth being precise about: the
 * IFrame Player API needs no API key, draws on no quota and has no daily cap.
 * Only finding the video costs anything (see services/player/youtubeSearch.ts).
 * A song already in the cache can therefore be played an unlimited number of
 * times without touching a metered API at all.
 *
 * The script installs a single global and announces itself through another, so
 * loading it twice would clobber a player mid-song. Hence the module-level
 * promise: every caller after the first waits on the same load.
 */

/** Only the slice of the player surface this app actually drives. */
export interface YouTubePlayer {
  loadVideoById(videoId: string): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  getPlayerState(): number
  getCurrentTime(): number
  getDuration(): number
  setVolume(volume: number): void
  destroy(): void
}

export interface YouTubePlayerEvent {
  target: YouTubePlayer
  data: number
}

interface YouTubePlayerOptions {
  videoId?: string
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: YouTubePlayerEvent) => void
    onStateChange?: (event: YouTubePlayerEvent) => void
    onError?: (event: YouTubePlayerEvent) => void
  }
}

interface YouTubeNamespace {
  Player: new (
    host: HTMLElement | string,
    options: YouTubePlayerOptions,
  ) => YouTubePlayer
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** The player's own state codes, so callers need not memorise the numbers. */
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

/**
 * Player error codes worth telling apart.
 *
 * 101 and 150 are the same thing under two numbers — the owner forbids
 * embedding. Searching with `videoEmbeddable=true` should mean these never
 * arrive, but "should" is not a thing to stake a party on, so the player treats
 * them as "try the next candidate" rather than as a dead end.
 */
export const PLAYER_ERROR = {
  INVALID_ID: 2,
  NOT_PLAYABLE: 5,
  NOT_FOUND: 100,
  EMBED_DISABLED_101: 101,
  EMBED_DISABLED_150: 150,
} as const

export function isEmbedRefusal(code: number): boolean {
  return (
    code === PLAYER_ERROR.EMBED_DISABLED_101 ||
    code === PLAYER_ERROR.EMBED_DISABLED_150 ||
    code === PLAYER_ERROR.NOT_FOUND ||
    code === PLAYER_ERROR.NOT_PLAYABLE
  )
}

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api'

let loader: Promise<YouTubeNamespace> | null = null

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (loader) return loader

  loader = new Promise<YouTubeNamespace>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('No browser environment'))
      return
    }

    // Already loaded — a second event listing, or a return to this screen.
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    /**
     * The API announces readiness by *calling* this global, so it has to exist
     * before the script runs. Chaining any existing one keeps this polite to
     * anything else on the page rather than assuming we are alone.
     */
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube player failed to initialise'))
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    if (existing) return

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onerror = () => {
      // Let a later attempt start clean rather than waiting forever on a
      // promise that can never settle — a DJ who fixes their WiFi and taps
      // again should get a real retry.
      loader = null
      reject(new Error('Could not load the YouTube player'))
    }
    document.head.appendChild(script)
  })

  return loader
}

/** Testing seam: forget any in-flight or completed load. */
export function __resetYouTubeApiLoader(): void {
  loader = null
}

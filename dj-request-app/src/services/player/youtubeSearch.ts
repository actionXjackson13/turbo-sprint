import { ServiceError } from '../types'
import { normalizeSongText } from '../../utils/normalizeText'

/**
 * Finding the video that *is* a requested song.
 *
 * This is the half of in-app playback that costs something. Playback itself is
 * free and unmetered — see features/player/youtubeApi.ts — but turning "Levitating
 * by Dua Lipa" into a video id needs YouTube's Data API, and a `search.list`
 * call draws on a bucket capped at roughly a hundred calls a day on the free
 * tier. That is the entire budget, and it does not grow with the party.
 *
 * Two things keep it comfortable:
 *
 * - **Every result is cached forever** (see videoCache.ts). A song costs one
 *   lookup in its life, not one per play and not one per party. The cap is
 *   really "a hundred songs never requested on this device before, per day",
 *   and it decays toward nothing as the cache fills.
 * - **One request per song, never two.** No confirming call, no retry with
 *   looser filters. Ranking happens here, on results we already paid for.
 *
 * `videoEmbeddable=true` is load-bearing rather than tidy. Major labels
 * routinely forbid embedding, and a blocked video fails *inside* the player as
 * a grey box (error 150) with the song already announced to the room. Asking
 * YouTube to exclude them means the failure cannot happen at all.
 */

export interface VideoMatch {
  videoId: string
  /** YouTube's title, kept so the DJ can see what was actually picked. */
  videoTitle: string
  channelTitle: string
}

/**
 * Why no video is playing. Each one has a different remedy, and a party is the
 * worst possible time to guess between them.
 */
export type PlayerFailure =
  | 'no_key'
  | 'key_rejected'
  | 'quota'
  | 'not_found'
  | 'network'

export class PlayerError extends ServiceError {
  readonly failure: PlayerFailure

  constructor(failure: PlayerFailure, message: string) {
    super(failure === 'network' ? 'network' : 'unknown', message)
    this.name = 'PlayerError'
    this.failure = failure
  }
}

export function playerFailureMessage(failure: PlayerFailure): string {
  switch (failure) {
    case 'no_key':
      return 'Add a YouTube key in Event settings to play songs in the app.'
    case 'key_rejected':
      return 'YouTube rejected that key. Check it in Event settings — a new key can take a few minutes to start working.'
    case 'quota':
      return 'YouTube’s daily song lookups are used up. Songs already played tonight still work, and the limit resets at midnight Pacific.'
    case 'not_found':
      return 'Couldn’t find this one on YouTube. Skip it, or play it yourself.'
    case 'network':
      return 'Couldn’t reach YouTube. Check the connection and try again.'
  }
}

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search'

/** YouTube's own category id for Music. Keeps reaction videos out. */
const MUSIC_CATEGORY = '10'

/**
 * Enough candidates for the ranking below to have something to choose between,
 * and no more — they all arrive in the one response, so this costs nothing
 * extra, but a longer list is a longer thing to score.
 */
const CANDIDATES = 10

const TIMEOUT_MS = 8_000

interface YouTubeSearchItem {
  id?: { videoId?: string }
  snippet?: { title?: string; channelTitle?: string }
}

interface YouTubeSearchBody {
  items?: YouTubeSearchItem[]
  error?: { errors?: { reason?: string }[]; message?: string }
}

/**
 * Words that mean "this is not the recording that was asked for".
 *
 * Only counted against a video when the *request* does not contain them: a
 * guest who asks for the Glastonbury version should get the live one, and a
 * guest who asks for a remix should get the remix. It is the mismatch that
 * matters, not the word.
 */
const WRONG_VERSION = [
  'live',
  'cover',
  'karaoke',
  'instrumental',
  'remix',
  'sped up',
  'slowed',
  'nightcore',
  '8d',
  'reaction',
  'tutorial',
  'reverb',
  'mashup',
  'parody',
]

/**
 * Score a candidate for "is this the record, played straight".
 *
 * The auto-generated "– Topic" channels win by a distance and it is worth
 * saying why: they are uploaded by the label from the same master the streaming
 * services get, they are audio-only so nothing burns bandwidth on a video
 * nobody is watching, and they carry no intro, outro or channel bumper to talk
 * over the start of the song.
 */
export function scoreCandidate(
  candidate: { videoTitle: string; channelTitle: string },
  request: { title: string; artist: string },
): number {
  const videoTitle = normalizeSongText(candidate.videoTitle)
  const channel = normalizeSongText(candidate.channelTitle)
  const wantedTitle = normalizeSongText(request.title)
  const wantedArtist = normalizeSongText(request.artist)
  const wanted = `${wantedTitle} ${wantedArtist}`

  let score = 0

  // Label-uploaded audio, which is what a party actually wants.
  if (/ topic$/.test(channel)) score += 50
  // The artist's own channel, or their Vevo one.
  else if (wantedArtist && channel.includes(wantedArtist)) score += 20

  if (wantedTitle && videoTitle.includes(wantedTitle)) score += 15
  if (wantedArtist && videoTitle.includes(wantedArtist)) score += 10

  for (const marker of WRONG_VERSION) {
    if (videoTitle.includes(marker) && !wanted.includes(marker)) score -= 40
  }

  // Lyric videos are usually the right audio, but often a re-upload at lower
  // quality. Enough of a nudge to lose to a Topic upload, not enough to lose to
  // nothing.
  if (videoTitle.includes('lyrics') && !wanted.includes('lyrics')) score -= 15

  return score
}

/**
 * Order what YouTube returned, best first.
 *
 * The whole ranked list is kept rather than just the winner, because it is what
 * makes "wrong song" free. Every candidate arrived in the one response that was
 * already paid for, so stepping to the next-best pick costs no quota at all —
 * without this the DJ's only recourse mid-party would be a second search, at a
 * moment when the daily budget is the thing least worth spending.
 *
 * `sort` is stable, so candidates YouTube considered equally relevant keep the
 * order it put them in.
 */
export function rankCandidates(
  candidates: VideoMatch[],
  request: { title: string; artist: string },
): VideoMatch[] {
  return [...candidates].sort(
    (a, b) => scoreCandidate(b, request) - scoreCandidate(a, request),
  )
}

/**
 * Read the failure out of a Google API error response.
 *
 * Quota and a bad key both arrive as `403`, and they are opposite problems: one
 * is "wait until tomorrow", the other is "fix the thing you pasted". The reason
 * code is the only thing that separates them.
 */
function failureFor(status: number, body: YouTubeSearchBody): PlayerFailure {
  const reasons = (body.error?.errors ?? []).map((e) => e.reason ?? '')
  if (reasons.some((r) => r === 'quotaExceeded' || r === 'rateLimitExceeded')) {
    return 'quota'
  }
  if (status === 400 || status === 401 || status === 403) return 'key_rejected'
  return 'network'
}

/**
 * Resolve one song to a ranked list of videos.
 *
 * This is the metered path — every call spends one of the day's hundred. Go
 * through `resolveVideo` instead, which only reaches here for a song this
 * device has never seen.
 */
export async function searchYouTube(
  request: { title: string; artist: string },
  apiKey: string,
  opts?: { signal?: AbortSignal },
): Promise<VideoMatch[]> {
  if (!apiKey.trim()) {
    throw new PlayerError('no_key', playerFailureMessage('no_key'))
  }

  const url = `${ENDPOINT}?${new URLSearchParams({
    key: apiKey.trim(),
    part: 'snippet',
    q: `${request.title} ${request.artist}`.trim(),
    type: 'video',
    videoCategoryId: MUSIC_CATEGORY,
    // The reason a song can never fail as a grey box mid-party.
    videoEmbeddable: 'true',
    maxResults: String(CANDIDATES),
  })}`

  // `fetch` has no timeout of its own, and a request that hangs forever would
  // leave the player sitting on a spinner with a room waiting.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = () => controller.abort()
  opts?.signal?.addEventListener('abort', onAbort, { once: true })

  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch {
    throw new PlayerError('network', playerFailureMessage('network'))
  } finally {
    clearTimeout(timer)
    opts?.signal?.removeEventListener('abort', onAbort)
  }

  const body = (await response.json().catch(() => ({}))) as YouTubeSearchBody

  if (!response.ok) {
    const failure = failureFor(response.status, body)
    throw new PlayerError(failure, playerFailureMessage(failure))
  }

  const candidates: VideoMatch[] = (body.items ?? [])
    .filter((item) => item.id?.videoId && item.snippet?.title)
    .map((item) => ({
      videoId: item.id!.videoId!,
      videoTitle: item.snippet!.title!,
      channelTitle: item.snippet!.channelTitle ?? '',
    }))

  if (candidates.length === 0) {
    throw new PlayerError('not_found', playerFailureMessage('not_found'))
  }

  return rankCandidates(candidates, request)
}

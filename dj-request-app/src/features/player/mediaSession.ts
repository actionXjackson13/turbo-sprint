import type { SongRequest } from '../../types/domain'

/**
 * Telling the phone what is playing.
 *
 * iOS has exactly one "Now Playing" slot — the thing the lock screen and
 * Control Centre point their transport buttons at — and whichever app touched
 * audio most recently owns it. Open Apple Music for one song mid-set and it
 * takes the slot and keeps it, paused or not: the lock screen may still show
 * the party's track, but the play button underneath resumes Apple Music.
 *
 * Registering here is what puts this app back in the running. It does two
 * jobs: the metadata makes the lock screen show the song a guest actually
 * requested, and the action handlers route those buttons back to this player
 * rather than to whatever last held the slot.
 *
 * It is not a guarantee. A native music app can always take the slot again,
 * and Safari suspends background audio under its own rules — which is why the
 * honest advice alongside this is to leave Apple Music alone while DJing.
 */

interface Handlers {
  onPlay: () => void
  onPause: () => void
  onNext: () => void
}

/** Every browser without the API — and Safari, for individual actions. */
function safely(action: () => void): void {
  try {
    action()
  } catch {
    // An unsupported action throws rather than no-oping. Not worth stopping for.
  }
}

export function publishNowPlaying(
  song: Pick<SongRequest, 'title' | 'artist' | 'artworkUrl'>,
  handlers: Handlers,
): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const session = navigator.mediaSession

  safely(() => {
    session.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      // The same cover the app shows, so the lock screen matches the room.
      artwork: song.artworkUrl
        ? [{ src: song.artworkUrl, sizes: '300x300', type: 'image/jpeg' }]
        : [],
    })
  })

  safely(() => session.setActionHandler('play', handlers.onPlay))
  safely(() => session.setActionHandler('pause', handlers.onPause))
  safely(() => session.setActionHandler('nexttrack', handlers.onNext))
  /**
   * No `previoustrack`. A queue is what the room asked for in the order the DJ
   * put them in, and there is no "back" that means anything — offering one
   * would be a button that either does nothing or replays a song already
   * marked played.
   */
  safely(() => session.setActionHandler('previoustrack', null))
}

export function setPlaybackState(state: 'playing' | 'paused' | 'none'): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  safely(() => {
    navigator.mediaSession.playbackState = state
  })
}

/** Hand the slot back when the queue runs dry or the DJ leaves. */
export function clearNowPlaying(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const session = navigator.mediaSession

  safely(() => {
    session.metadata = null
  })
  for (const action of ['play', 'pause', 'nexttrack'] as const) {
    safely(() => session.setActionHandler(action, null))
  }
  setPlaybackState('none')
}

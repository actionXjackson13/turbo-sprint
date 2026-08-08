import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AlbumArt } from '../../components'
import { routes } from '../../lib/router'
import { usePartyPlayerState } from '../../hooks/usePartyPlayerState'

/**
 * The transport that follows the DJ around.
 *
 * It exists because the video does. The embedded player has to stay mounted for
 * the music to keep playing, and an element cannot move between parents without
 * being destroyed — so rather than hide it somewhere and pretend it isn't there,
 * it lives here, at thumbnail size, with the controls beside it.
 *
 * The bar is always in the DOM, and merely slid out of sight when nothing is
 * playing. Unmounting it would take the player with it, and `display: none`
 * invites the browser to throttle or stop a video it thinks nobody can see.
 */
export function PlayerBar({ eventId }: { eventId: string }) {
  const navigate = useNavigate()
  const { hostRef, status, current, togglePause, skip } = usePartyPlayerState()

  const hidden = status === 'idle'
  const busy = status === 'resolving'

  return (
    <div
      className={clsx(
        'fixed inset-x-0 bottom-safe-nav z-20 mx-auto w-full max-w-shell',
        'border-t border-hairline bg-ink-900/95 backdrop-blur-xl',
        'transition-transform duration-200',
        // Slid away rather than removed: the player inside must survive.
        hidden && 'pointer-events-none translate-y-full opacity-0',
      )}
      aria-hidden={hidden}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/*
          The video itself. Kept at a deliberate 16:9 thumbnail rather than
          hidden outright — a party needs the audio, not the picture, but a
          player the browser considers invisible is a player it may pause.
        */}
        <div
          ref={hostRef}
          className="h-9 w-16 shrink-0 overflow-hidden rounded-control bg-black [&_iframe]:size-full"
        />

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => navigate(routes.dj.player(eventId))}
        >
          <AlbumArt url={current?.artworkUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">
              {current?.title ?? 'Nothing playing'}
            </span>
            <span className="block truncate text-meta text-fg-muted">
              {busy ? 'Finding it…' : (current?.artist ?? '')}
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-label={status === 'paused' ? 'Resume' : 'Pause'}
          disabled={busy}
          onClick={togglePause}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-700 text-fg disabled:opacity-40"
        >
          {status === 'paused' ? <PlayIcon /> : <PauseIcon />}
        </button>

        <button
          type="button"
          aria-label="Skip song"
          onClick={skip}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-700 text-fg"
        >
          <SkipIcon />
        </button>
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M6 5l9 7-9 7zM17 5h2v14h-2z" />
    </svg>
  )
}

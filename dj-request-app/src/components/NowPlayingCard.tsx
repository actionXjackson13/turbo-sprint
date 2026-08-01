import type { ReactNode } from 'react'
import clsx from 'clsx'
import { AppCard } from './AppCard'

export interface NowPlayingCardProps {
  nowPlaying: { title: string; artist: string } | null
  /** Larger treatment for the screen that leads with it — the DJ's panel. */
  headline?: boolean
  /** Shown in place of a track when nothing is set. */
  emptyHint: string
  /** Controls and context rendered beneath the track. */
  children?: ReactNode
}

/**
 * The current track. Three screens showed it and all three drew it slightly
 * differently; they now share this, so "what's playing" reads the same to the
 * DJ and to the room.
 */
export function NowPlayingCard({
  nowPlaying,
  headline = false,
  emptyHint,
  children,
}: NowPlayingCardProps) {
  return (
    <AppCard emphasis={Boolean(nowPlaying)}>
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex shrink-0 items-center justify-center rounded-full',
            nowPlaying
              ? 'bg-brand-500/20 text-brand-400'
              : 'bg-ink-700 text-fg-subtle',
            headline ? 'size-14' : 'size-11',
          )}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={headline ? 'size-7' : 'size-5'}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          {nowPlaying ? (
            <>
              <p
                className={clsx(
                  'truncate font-bold text-fg',
                  headline ? 'text-2xl leading-tight' : 'text-base',
                )}
              >
                {nowPlaying.title}
              </p>
              <p
                className={clsx(
                  'truncate text-fg-muted',
                  headline ? 'text-base' : 'text-sm',
                )}
              >
                {nowPlaying.artist}
              </p>
            </>
          ) : (
            <p className="text-sm text-fg-muted">{emptyHint}</p>
          )}
        </div>
      </div>

      {children && <div className="mt-4">{children}</div>}
    </AppCard>
  )
}

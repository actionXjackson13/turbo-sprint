import type { ReactNode } from 'react'
import clsx from 'clsx'
import { AppCard } from './AppCard'
import { AlbumArt } from './AlbumArt'

export interface NowPlayingCardProps {
  nowPlaying: {
    title: string
    artist: string
    artworkUrl?: string | null
  } | null
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
    <AppCard tone={nowPlaying ? 'accent' : 'raised'}>
      <div className={clsx('flex gap-3', headline ? 'items-start' : 'items-center')}>
        {/* The sleeve, at the size the screen leads with. This is the one
            place a picture does more than decorate: a DJ mid-set identifies
            what is playing from across the booth by its cover. */}
        <AlbumArt
          url={nowPlaying?.artworkUrl}
          size={headline ? 'xl' : 'md'}
        />

        <div className="min-w-0 flex-1">
          {nowPlaying ? (
            <>
              {/* On the screens that lead with it this is the largest text in
                  the app — the single thing a DJ glances at mid-set. */}
              <p
                className={clsx(
                  'truncate font-bold text-fg',
                  headline ? 'text-hero' : 'text-row',
                )}
              >
                {nowPlaying.title}
              </p>
              <p
                className={clsx(
                  'truncate text-fg-muted',
                  headline ? 'mt-1 text-sm' : 'text-meta mt-0.5',
                )}
              >
                {nowPlaying.artist}
              </p>
            </>
          ) : (
            <p className="text-meta text-fg-muted">{emptyHint}</p>
          )}
        </div>
      </div>

      {children && <div className="mt-3.5">{children}</div>}
    </AppCard>
  )
}

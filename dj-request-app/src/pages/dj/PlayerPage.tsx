import { useNavigate, useParams } from 'react-router-dom'
import {
  AlbumArt,
  AppButton,
  AppCard,
  EmptyState,
  PageHeader,
  Section,
  SongRequestListSkeleton,
} from '../../components'
import { routes } from '../../lib/router'
import { usePartyPlayerState } from '../../hooks/usePartyPlayerState'
import { hasYouTubeKey } from '../../services/player/playerSettings'
import { appleMusicLinkFor } from '../../features/appleMusic/handoff'

/**
 * The deck.
 *
 * The video itself is not here — it plays in the transport bar at the bottom of
 * every DJ screen, because that is the only place it can live and survive being
 * navigated away from. What this screen adds is everything the bar has no room
 * for: the artwork at a size worth looking at, which pick was made and the way
 * to reject it, and the queue that follows.
 */
export function PlayerPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { status, current, match, queue, loading, failure, start, skip, wrongSong } =
    usePartyPlayerState()

  const appleLink = current ? appleMusicLinkFor(current) : null
  const idle = status === 'idle' || status === 'empty'

  return (
    <>
      <PageHeader
        title="Player"
        subtitle={`${queue.length} ${queue.length === 1 ? 'song' : 'songs'} queued`}
      />

      <main className="flex-1 space-y-7 px-4 py-5 pb-safe-player">
        {!hasYouTubeKey() && (
          <AppCard>
            <p className="text-sm text-fg-muted">
              Playing songs in the app needs a free YouTube key. It takes a
              couple of minutes and costs nothing.
            </p>
            <AppButton
              fullWidth
              className="mt-3"
              onClick={() => navigate(routes.dj.settings(eventId))}
            >
              Set it up
            </AppButton>
          </AppCard>
        )}

        {failure && (
          <AppCard className="border-danger-500/40 bg-danger-500/10">
            <p className="text-sm text-fg">{failure}</p>
          </AppCard>
        )}

        <div className="flex flex-col items-center text-center">
          <AlbumArt url={current?.artworkUrl} size="3xl" className="!size-40" />

          <h2 className="mt-4 text-hero font-bold text-fg">
            {current?.title ?? 'Nothing playing'}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {status === 'resolving'
              ? 'Finding it on YouTube…'
              : (current?.artist ??
                'Start the queue and the app plays it, song after song.')}
          </p>

          {/*
            Which video was picked, spelled out. Search can land on a live take
            or a cover, and the DJ finding out from the speakers is too late —
            this is what makes "wrong song" something they can act on before the
            room notices.
          */}
          {match && (
            <p className="mt-3 max-w-full truncate text-meta text-fg-subtle">
              Playing: {match.videoTitle}
              {match.channelTitle && ` · ${match.channelTitle}`}
            </p>
          )}
        </div>

        {idle ? (
          <AppButton
            size="lg"
            fullWidth
            disabled={queue.length === 0}
            onClick={start}
          >
            {queue.length === 0 ? 'Queue is empty' : 'Play the queue'}
          </AppButton>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <AppButton variant="secondary" onClick={wrongSong}>
              Wrong song
            </AppButton>
            <AppButton variant="secondary" onClick={skip}>
              Skip
            </AppButton>
          </div>
        )}

        {/*
          The subscription the DJ already pays for, one tap away. YouTube is
          what makes this free; Apple Music is what makes it sound good, and
          there is no reason a night has to be all of one or all of the other.
        */}
        {appleLink && (
          <AppButton
            variant="ghost"
            fullWidth
            onClick={() => window.open(appleLink, '_blank', 'noopener')}
          >
            Open in Apple Music
          </AppButton>
        )}

        <Section title="Up next">
          {loading && queue.length === 0 ? (
            <SongRequestListSkeleton count={2} />
          ) : queue.length === 0 ? (
            <EmptyState
              title="Nothing queued"
              description="Queue requests and they play here automatically."
            />
          ) : (
            <ol className="space-y-2">
              {queue.map((request, index) => (
                <li key={request.id}>
                  <AppCard className="flex items-center gap-3 !py-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-600 text-xs font-bold tabular-nums text-fg-muted">
                      {index + 1}
                    </span>
                    <AlbumArt url={request.artworkUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">
                        {request.title}
                      </p>
                      <p className="truncate text-xs text-fg-muted">
                        {request.artist}
                      </p>
                    </div>
                  </AppCard>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </main>
    </>
  )
}

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  EmptyState,
  NowPlayingCard,
  PageHeader,
  Section,
  SectionLink,
  SongRequestListSkeleton,
} from '../../components'
import { routes } from '../../lib/router'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { usePlayNext } from '../../features/requests/usePlayNext'
import { usePartyPlayerState } from '../../hooks/usePartyPlayerState'
import { hasYouTubeKey } from '../../services/player/playerSettings'
import { QueueList } from './QueueList'
import { getErrorMessage } from '../../utils/errors'
import type { SongRequest } from '../../types/domain'
import {
  canHandOff,
  handOffToAppleMusic,
} from '../../features/appleMusic/handoff'

/**
 * The deck: what is on, and what follows it.
 *
 * The in-app player used to live on a screen of its own, which split the night
 * in two — a queue you could reorder here, and the same queue playing over
 * there, with no way to see both at once. They are one thing. The player plays
 * *this* list, in *this* order, so reordering and playback belong on the same
 * screen and the drag that moves a song up is visibly the drag that changes
 * what comes next.
 *
 * Both ways of running a night are offered side by side, because the app has
 * never assumed it owns the music: a DJ on their own decks wants the queue as a
 * running order and only needs to tell the room what is on, while a DJ with a
 * phone in a speaker wants the app to actually play it.
 */
export function QueuePage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()
  const { event, refresh } = useDjEvent()

  const { requests, loading, reload } = useEventRequests(eventId)
  const [busy, setBusy] = useState(false)
  const { playNext, pendingId } = usePlayNext(eventId, reload)

  const player = usePartyPlayerState()
  /** Running, in any sense the DJ would call running. */
  const playerLive =
    player.status === 'playing' ||
    player.status === 'paused' ||
    player.status === 'resolving'

  const queue = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'queued')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [requests],
  )

  const reorder = async (orderedIds: string[]) => {
    setBusy(true)
    try {
      await service.reorderQueue(eventId, orderedIds)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const markPlayed = async (request: SongRequest) => {
    try {
      await service.updateRequestStatus(request.id, 'played')
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  /**
   * Advance the night by one song *without* the app playing it — for a DJ
   * running their own decks, where this only has to tell the room what is on.
   *
   * When the in-app player is running this is not the button on offer; skipping
   * is, because moving the now-playing row while audio kept going would leave
   * the guests' screens describing a song nobody could hear.
   */
  const markNextAsPlaying = async () => {
    const next = queue[0]
    if (!next) return
    setBusy(true)
    try {
      await service.setNowPlaying(eventId, {
        title: next.title,
        artist: next.artist,
        sourceRequestId: next.id,
        // Carried across so the cover survives the request being played and
        // retired — the track outlives the row it came from.
        artworkUrl: next.artworkUrl,
      })
      await Promise.all([refresh(), reload()])
      toast.success(`Now playing ${next.title}`)

      if (canHandOff()) handOffToAppleMusic(next)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const clearNowPlaying = async () => {
    setBusy(true)
    try {
      await service.setNowPlaying(eventId, null)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Queue" subtitle={`${queue.length} up next`} />

      <main className="flex-1 space-y-7 px-4 py-5">
        <div>
          <NowPlayingCard
            nowPlaying={event?.nowPlaying ?? null}
            emptyHint="Nothing playing yet."
          >
            <div className="space-y-2">
              {playerLive ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <AppButton
                      size="lg"
                      disabled={player.status === 'resolving'}
                      onClick={player.togglePause}
                    >
                      {player.status === 'paused' ? 'Resume' : 'Pause'}
                    </AppButton>
                    <AppButton size="lg" variant="secondary" onClick={player.skip}>
                      Skip
                    </AppButton>
                  </div>

                  {/*
                    Which video was picked, spelled out. Search can land on a
                    live take or a cover, and the DJ hearing it first is too
                    late — this is what makes "wrong song" actionable before the
                    room notices.
                  */}
                  {player.match && (
                    <button
                      type="button"
                      onClick={player.wrongSong}
                      className="block w-full truncate text-left text-meta text-fg-subtle underline underline-offset-2"
                    >
                      {player.status === 'resolving'
                        ? 'Finding it on YouTube…'
                        : `Playing: ${player.match.videoTitle} — wrong song?`}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <AppButton
                    size="lg"
                    fullWidth
                    disabled={queue.length === 0}
                    onClick={player.start}
                  >
                    Play the queue
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    fullWidth
                    disabled={busy || queue.length === 0}
                    onClick={() => void markNextAsPlaying()}
                  >
                    I’ll play it myself
                  </AppButton>
                </>
              )}

              {event?.nowPlaying && !playerLive && (
                <AppButton
                  variant="ghost"
                  fullWidth
                  disabled={busy}
                  onClick={clearNowPlaying}
                >
                  Clear
                </AppButton>
              )}
            </div>
          </NowPlayingCard>
        </div>

        {player.failure && (
          <AppCard className="border-danger-500/40 bg-danger-500/10">
            <p className="text-sm text-fg">{player.failure}</p>
          </AppCard>
        )}

        {!hasYouTubeKey() && (
          <AppCard>
            <p className="text-sm text-fg-muted">
              To have the app play these itself, add a free YouTube key. Takes a
              couple of minutes and costs nothing.
            </p>
            <AppButton
              fullWidth
              className="mt-3"
              onClick={() => navigate(routes.dj.music(eventId))}
            >
              Set it up
            </AppButton>
          </AppCard>
        )}

        <Section
          title="Up next"
          action={
            <SectionLink onClick={() => navigate(routes.dj.addSong(eventId))}>
              Add a song
            </SectionLink>
          }
        >
          {loading && requests.length === 0 ? (
            <SongRequestListSkeleton count={2} />
          ) : queue.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Queue a request or push a vote winner here."
            />
          ) : (
            <QueueList
              queue={queue}
              busy={busy}
              onReorder={reorder}
              onPlayNext={(request) => void playNext(request)}
              playNextPendingId={pendingId}
              onMarkPlayed={markPlayed}
            />
          )}
        </Section>
      </main>
    </>
  )
}

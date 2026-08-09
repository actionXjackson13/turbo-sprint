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
import { useEnforceQueueOrder } from '../../features/requests/useEnforceQueueOrder'
import { useUndoLastPlayed } from '../../features/requests/useUndoLastPlayed'
import {
  countRoomSongs,
  splitQueue,
} from '../../features/requests/queueOrdering'
import { usePartyPlayerState } from '../../hooks/usePartyPlayerState'
import { hasYouTubeKey } from '../../services/player/playerSettings'
import { QueueList } from './QueueList'
import { LoadSetDialog } from './LoadSetDialog'
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

  const [loadingSet, setLoadingSet] = useState(false)

  const enforceOrder = useEnforceQueueOrder(eventId)
  const undoLast = useUndoLastPlayed(eventId, requests, reload)

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

  const requested = useMemo(() => countRoomSongs(queue), [queue])
  const { main, sub } = useMemo(() => splitQueue(queue), [queue])

  /**
   * Reordering happens inside one half, but the queue is numbered end to end —
   * so each list sends its own ids plus the other half's, unchanged, and says
   * where the boundary now falls.
   */
  const reorderHalf = async (orderedIds: string[], half: 'main' | 'sub') => {
    const full =
      half === 'main'
        ? [...orderedIds, ...sub.map((r) => r.id)]
        : [...main.map((r) => r.id), ...orderedIds]
    const mainCount = half === 'main' ? orderedIds.length : main.length

    setBusy(true)
    try {
      await service.reorderQueue(eventId, full, mainCount)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Across the divider.
   *
   * Only the half changes; the position is left alone and the reordering pass
   * settles it. A promoted song keeps its high position, which puts it at the
   * end of main — behind the requests already waiting, ahead of the whole set,
   * and above every request that arrives after it.
   */
  const moveGroup = async (request: SongRequest) => {
    setBusy(true)
    try {
      await service.setQueueGroup(
        request.id,
        request.queueGroup === 'sub' ? 'main' : 'sub',
      )
      await enforceOrder()
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
      {/*
        The split, not just the total. Once a set can fill the queue, "18 up
        next" says nothing about whether anyone has been heard — and the number
        the DJ actually needs mid-party is how many of those the room asked for.
      */}
      <PageHeader
        title="Queue"
        subtitle={
          requested > 0
            ? `${queue.length} up next · ${requested} requested`
            : `${queue.length} up next`
        }
      />

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

        {/*
          Skipping is one tap and was irreversible, and the two commonest
          reasons to press it are both mistakes — a thumb on the wrong button,
          and a bad YouTube match rather than a bad song.
        */}
        {undoLast.candidate && (
          <button
            type="button"
            disabled={undoLast.busy}
            onClick={() => void undoLast.undo()}
            className="w-full text-center text-meta text-fg-subtle underline underline-offset-2 disabled:opacity-50"
          >
            Put “{undoLast.candidate.title}” back at the front
          </button>
        )}

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
            <div className="flex items-center gap-3">
              <SectionLink onClick={() => setLoadingSet(true)}>
                Load a set
              </SectionLink>
              <SectionLink onClick={() => navigate(routes.dj.addSong(eventId))}>
                Add a song
              </SectionLink>
            </div>
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
            <div className="space-y-3">
              <QueueList
                queue={main}
                busy={busy}
                onReorder={(ids) => reorderHalf(ids, 'main')}
                onPlayNext={(request) => void playNext(request)}
                playNextPendingId={pendingId}
                onMarkPlayed={markPlayed}
                onMoveGroup={(request) => void moveGroup(request)}
              />

              {sub.length > 0 && <SubgroupDivider />}

              {sub.length > 0 && (
                <QueueList
                  queue={sub}
                  busy={busy}
                  onReorder={(ids) => reorderHalf(ids, 'sub')}
                  onPlayNext={(request) => void playNext(request)}
                  playNextPendingId={pendingId}
                  onMarkPlayed={markPlayed}
                  onMoveGroup={(request) => void moveGroup(request)}
                />
              )}
            </div>
          )}
        </Section>
      </main>

      <LoadSetDialog
        open={loadingSet}
        eventId={eventId}
        onClose={() => setLoadingSet(false)}
        onLoaded={reload}
      />
    </>
  )
}

/**
 * Where the queue changes gear.
 *
 * A centred hairline was too easy to read past — it looked like the gap
 * between two cards rather than a boundary, on the one screen where knowing
 * which side a song is on decides whether it plays tonight.
 *
 * So the weight sits on the left, where the eye starts: a solid chip naming
 * the half, with the rule growing out of it and tapering away across the
 * screen. The taper is a clip-path wedge rather than a plain line, so the
 * colour is thickest against the word and thins to nothing — the shape says
 * "this is where it begins" without needing a second word to explain it.
 *
 * Cyan rather than the red used on requested rows: this marks structure, not
 * ownership, and the two must not be mistaken for each other.
 */
function SubgroupDivider() {
  return (
    <div className="flex items-center pt-2 pb-1" aria-hidden="true">
      <span
        className={
          'shrink-0 rounded-full border border-accent-400/60 bg-accent-500/20 ' +
          'px-2.5 py-1 text-label uppercase text-accent-400'
        }
      >
        Subgroup
      </span>
      <span
        className="h-2 flex-1 bg-gradient-to-r from-accent-400 to-accent-400/0"
        style={{
          // Thick where it meets the chip, tapering to a hairline as it goes.
          clipPath: 'polygon(0 0, 100% 44%, 100% 56%, 0 100%)',
        }}
      />
    </div>
  )
}

import { useCallback, useMemo } from 'react'
import { AlbumArt, AppButton, EmptyState } from '../../components'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { usePlayNext } from '../../features/requests/usePlayNext'
import { useQueueRequest } from '../../features/requests/useQueueRequest'
import { useRequestStatus } from '../../features/requests/useRequestStatus'
import { useSetNowPlaying } from '../../features/requests/useSetNowPlaying'
import { NowPlayingSheet } from './NowPlayingSheet'
import type { SongRequest } from '../../types/domain'

/**
 * SoundBoard as a strip along the edge of the screen.
 *
 * A DJ working from a laptop has rekordbox filling it. The app on a phone next
 * to the mixer means picking the phone up, waking it and finding the tab every
 * time somebody asks for something — so requests get answered late or not at
 * all, which is the one job the room can see.
 *
 * This is the whole loop and nothing else: what is on, what is next, and who
 * has asked for what, each with the two or three moves worth making. No
 * settings, no sets, no theme — those are worth a trip to the full window, and
 * a panel that tried to hold them would be a small bad copy of it.
 *
 * Sized to be narrow and tall, because that is the shape of the space left over
 * beside a set of decks. Everything scrolls in one column; nothing is laid out
 * side by side, since the panel may end up 320 pixels wide.
 */
export function OverlayPanelPage({
  container = null,
}: {
  /** Set when the panel is rendered into a floating window rather than a tab. */
  container?: HTMLElement | null
} = {}) {
  const { event, refresh } = useDjEvent()
  const eventId = event?.id ?? ''

  const { requests, loading, reload } = useEventRequests(eventId, {
    sort: 'votes',
  })

  const { playNext, pendingId: playNextPending } = usePlayNext(eventId, reload)
  const { queueRequest, pendingId: queuePending } = useQueueRequest(
    eventId,
    reload,
  )
  const setStatus = useRequestStatus(reload)

  const queue = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'queued')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [requests],
  )
  const pending = useMemo(
    () => requests.filter((r) => r.status === 'pending'),
    [requests],
  )

  const nowPlaying = useSetNowPlaying(
    eventId,
    queue,
    useCallback(() => Promise.all([refresh(), reload()]), [refresh, reload]),
  )

  const upNext = queue[0] ?? null

  return (
    <>
      {/*
        The drag handle. A frameless always-on-top window has no title bar to
        grab, so the header is the title bar — and every control inside the
        panel has to opt back out, or pressing a button would move the window
        instead of pressing the button.
      */}
      <header
        className="shrink-0 border-b border-hairline bg-ink-900 px-3 py-2 [-webkit-app-region:drag]"
        data-panel-drag="true"
      >
        <p className="truncate text-sm font-semibold text-fg">
          {event?.name ?? 'SoundBoard'}
        </p>
        <p className="text-label uppercase text-fg-subtle">
          {pending.length > 0
            ? `${pending.length} waiting · ${queue.length} queued`
            : `${queue.length} queued`}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-hairline bg-ink-900/60 p-3 [-webkit-app-region:no-drag]">
          <div className="flex items-center gap-2.5">
            <AlbumArt url={event?.nowPlaying?.artworkUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-label uppercase text-brand-400">Now playing</p>
              <p className="truncate text-sm font-bold text-fg">
                {event?.nowPlaying?.title ?? 'Nothing set'}
              </p>
              <p className="truncate text-xs text-fg-muted">
                {event?.nowPlaying?.artist ?? 'Say what you’ve got on'}
              </p>
            </div>
          </div>

          <AppButton
            size="sm"
            fullWidth
            className="mt-2"
            disabled={nowPlaying.saving}
            onClick={nowPlaying.ask}
          >
            What’s on now
          </AppButton>

          <div className="mt-2 flex items-center gap-2 rounded-control bg-ink-950/60 px-2.5 py-1.5">
            <span className="shrink-0 text-label uppercase text-fg-subtle">
              Next
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-fg">
              {upNext ? (
                <>
                  {upNext.title}
                  <span className="text-fg-muted"> — {upNext.artist}</span>
                </>
              ) : (
                <span className="text-fg-muted">Nothing queued</span>
              )}
            </span>
          </div>
        </section>

        <section className="p-3 [-webkit-app-region:no-drag]">
          <p className="text-label uppercase text-fg-subtle">
            Waiting on you
          </p>

          {loading && requests.length === 0 ? (
            <p className="mt-3 text-xs text-fg-muted">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="mt-2">
              <EmptyState
                title="All caught up"
                description="New requests land here."
              />
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {pending.map((request) => (
                <li key={request.id}>
                  <PanelRequest
                    request={request}
                    busy={
                      playNextPending === request.id ||
                      queuePending === request.id
                    }
                    onPlayNext={() => void playNext(request)}
                    onQueue={() => void queueRequest(request)}
                    onDecline={() => void setStatus(request.id, 'declined')}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <NowPlayingSheet
        open={nowPlaying.open}
        saving={nowPlaying.saving}
        onPick={(song) => void nowPlaying.choose(song)}
        onClose={nowPlaying.close}
        container={container}
      />
    </>
  )
}

/**
 * One request, at panel density.
 *
 * `SongRequestCard` is the right thing on a phone and the wrong thing here —
 * artwork, a status badge, a relative timestamp and a vote pill are most of the
 * height of this window, spent on a row the DJ resolves in one glance. What is
 * left is what the decision actually turns on: the song, who asked, how many
 * agreed, and the three answers.
 */
function PanelRequest({
  request,
  busy,
  onPlayNext,
  onQueue,
  onDecline,
}: {
  request: SongRequest
  busy: boolean
  onPlayNext: () => void
  onQueue: () => void
  onDecline: () => void
}) {
  return (
    <div className="rounded-card border border-hairline bg-ink-900 p-2.5">
      <p className="truncate text-sm font-semibold text-fg">{request.title}</p>
      <p className="truncate text-xs text-fg-muted">{request.artist}</p>
      <p className="mt-0.5 truncate text-xs text-fg-subtle">
        {request.guestDisplayName}
        {request.voteCount > 0 &&
          ` · ${request.voteCount} ${request.voteCount === 1 ? 'vote' : 'votes'}`}
      </p>

      <div className="mt-2 flex gap-1.5">
        <AppButton size="sm" loading={busy} onClick={onPlayNext}>
          Next
        </AppButton>
        <AppButton
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onQueue}
        >
          Queue
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onDecline}
          className="ml-auto"
        >
          Decline
        </AppButton>
      </div>
    </div>
  )
}

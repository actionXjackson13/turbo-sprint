import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlbumArt,
  AppButton,
  AppCard,
  PartyStatus,
  EmptyState,
  NowPlayingCard,
  PageHeader,
  Section,
  SectionLink,
  SegmentedControl,
  SongRequestCard,
  SongRequestListSkeleton,
  StatusBadge,
} from '../../components'
import { routes } from '../../lib/router'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { selectMostWanted } from '../../features/requests/requestLists'
import { usePlayNext } from '../../features/requests/usePlayNext'
import { RequestActionSheet } from './RequestActionSheet'
import { CardActions } from './requestActions'
import { copyToClipboard } from '../../utils/clipboard'
import { getErrorMessage } from '../../utils/errors'
import type {
  RequestIntakeStatus,
  RequestStatus,
  SongRequest,
} from '../../types/domain'

type RequestView = 'new' | 'wanted'

/** How many of the queue to preview before sending the DJ to the Queue tab. */
const QUEUE_PREVIEW = 3

/** How much of each list the control panel previews before handing off. */
const PREVIEW = 3

export function EventControlPanelPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const { event, guestCount, refresh } = useDjEvent()
  const { requests, loading, reload } = useEventRequests(eventId, {
    sort: 'votes',
  })

  const [busy, setBusy] = useState(false)
  const [sheetFor, setSheetFor] = useState<SongRequest | null>(null)
  const [view, setView] = useState<RequestView>('new')
  const { playNext, pendingId } = usePlayNext(eventId, reload)

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
  // Exactly what the guests see on their event screen, from the same helper.
  const mostWanted = useMemo(() => selectMostWanted(requests), [requests])
  const visible = view === 'new' ? pending.slice(0, 4) : mostWanted

  const upNext = queue[0] ?? null

  const copyCode = async () => {
    if (!event) return
    const ok = await copyToClipboard(event.code)
    if (ok) toast.success(`Code ${event.code} copied`)
    else toast.error('Could not copy — long-press the code to copy it.')
  }

  const setIntake = async (next: RequestIntakeStatus) => {
    setBusy(true)
    try {
      await service.updateEventSettings(eventId, { requestStatus: next })
      await refresh()
      toast.success(
        next === 'open'
          ? 'Requests are open.'
          : next === 'paused'
            ? 'Requests paused.'
            : 'Requests closed.',
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Advance the night by one song. Promoting a queued request to now-playing
   * also retires it from the queue, so this is the whole "next track" gesture
   * in one tap instead of a trip to the Queue tab.
   *
   * Distinct from the per-request **Play next**, which decides *what* comes
   * next; this starts whatever that turned out to be.
   */
  const startNextSong = async () => {
    if (!upNext) return
    setBusy(true)
    try {
      await service.setNowPlaying(eventId, {
        title: upNext.title,
        artist: upNext.artist,
        sourceRequestId: upNext.id,
        // Carried across so the cover survives the request being played and
        // retired — the track outlives the row it came from.
        artworkUrl: upNext.artworkUrl,
      })
      await Promise.all([refresh(), reload()])
      toast.success(`Now playing ${upNext.title}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const quickAction = async (requestId: string, status: RequestStatus) => {
    try {
      await service.updateRequestStatus(requestId, status)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  if (!event) return null

  return (
    <>
      <PageHeader
        title={event.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="truncate">
              {guestCount} {guestCount === 1 ? 'guest' : 'guests'} joined
            </span>
            <StatusBadge kind="intake" status={event.requestStatus} />
          </span>
        }
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        {/* The night, in one card: what is on, and what follows it. No
            section heading — the card names itself, and stacking a grey
            "NOW PLAYING" above a card that already says it in brand colour
            just pushed the thing itself further down the screen. */}
        <div>
          <NowPlayingCard
            nowPlaying={event.nowPlaying}
            headline
            emptyHint="Nothing set yet."
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-control bg-ink-900/60 px-3 py-2">
                <AlbumArt url={upNext?.artworkUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-label text-fg-subtle uppercase">
                    Up next
                  </p>
                  <p className="mt-0.5 truncate text-sm text-fg">
                    {upNext ? (
                      <>
                        {upNext.title}{' '}
                        <span className="text-fg-muted">— {upNext.artist}</span>
                      </>
                    ) : (
                      <span className="text-fg-muted">
                        Nothing queued. Queue a request below.
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <AppButton
                size="lg"
                fullWidth
                disabled={busy || !upNext}
                onClick={() => void startNextSong()}
              >
                Play next song
              </AppButton>
            </div>
          </NowPlayingCard>
        </div>

        <Section
          title="Queue"
          action={
            queue.length > 0 && (
              <SectionLink onClick={() => navigate(routes.dj.queue(eventId))}>
                Reorder{queue.length > QUEUE_PREVIEW && ` all ${queue.length}`}
              </SectionLink>
            )
          }
        >
          {loading && requests.length === 0 ? (
            <SongRequestListSkeleton count={2} />
          ) : queue.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Queue a request below, or push a vote winner here."
            />
          ) : (
            <ol className="space-y-2">
              {queue.slice(0, QUEUE_PREVIEW).map((request, index) => (
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

        {/* One request list. "New" and "Most wanted" overlapped heavily as
            separate sections — the same songs, under two headings. */}
        <Section
          title="Requests"
          action={
            <SegmentedControl
              label="Which requests to show"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'new',
                  label: `New${pending.length ? ` ${pending.length}` : ''}`,
                },
                { value: 'wanted', label: 'Most wanted' },
              ]}
            />
          }
        >
          {loading && requests.length === 0 ? (
            <SongRequestListSkeleton count={2} />
          ) : visible.length === 0 ? (
            <EmptyState
              title={view === 'new' ? 'All caught up' : 'No votes yet'}
              description={
                view === 'new'
                  ? 'New requests land here as guests send them.'
                  : 'Requests rank here as guests upvote them.'
              }
            />
          ) : (
            <div className="space-y-2">
              {visible.slice(0, PREVIEW).map((request) => (
                <SongRequestCard
                  key={request.id}
                  request={request}
                  showVoteCount
                  showStatus={view === 'wanted'}
                  onMore={() => setSheetFor(request)}
                  actions={
                    <CardActions
                      request={request}
                      playNextPending={pendingId === request.id}
                      onPlayNext={() => void playNext(request)}
                      onSetStatus={quickAction}
                    />
                  }
                />
              ))}
            </div>
          )}
        </Section>

        {/* Set-up details: needed once at the start, not all night. */}
        <Section title="Event">
          <PartyStatus code={event.code} className="mb-3" />

          <AppCard>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-label text-fg-subtle uppercase">
                  Join code
                </p>
                <span className="font-mono text-3xl font-bold tracking-[0.25em] text-brand-400">
                  {event.code}
                </span>
              </div>
              <AppButton variant="secondary" onClick={copyCode}>
                Copy
              </AppButton>
            </div>

            {/* Reading a code across a dark room is the biggest drop-off in the
                whole guest flow; this is the way out of it. */}
            <AppButton
              fullWidth
              className="mt-3"
              onClick={() => navigate(routes.dj.share(eventId))}
              leadingIcon={
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 20h1" />
                </svg>
              }
            >
              Show QR to the room
            </AppButton>

            {/* The current mode is shown as *selected*, not disabled.
                Disabling it greyed out the active choice, which read as
                "unavailable" rather than "this is what's on" — and dropped its
                label under the contrast floor. Re-picking the current mode is
                harmless, so the buttons stay live. */}
            <div
              role="group"
              aria-label="Request intake"
              className="mt-4 grid grid-cols-3 gap-2"
            >
              <AppButton
                variant={event.requestStatus === 'open' ? 'success' : 'secondary'}
                aria-pressed={event.requestStatus === 'open'}
                disabled={busy}
                onClick={() => setIntake('open')}
              >
                Open
              </AppButton>
              <AppButton
                variant={
                  event.requestStatus === 'paused' ? 'primary' : 'secondary'
                }
                aria-pressed={event.requestStatus === 'paused'}
                disabled={busy}
                onClick={() => setIntake('paused')}
              >
                Pause
              </AppButton>
              <AppButton
                variant={
                  event.requestStatus === 'closed' ? 'danger' : 'secondary'
                }
                aria-pressed={event.requestStatus === 'closed'}
                disabled={busy}
                onClick={() => setIntake('closed')}
              >
                Close
              </AppButton>
            </div>
          </AppCard>
        </Section>
      </main>

      <RequestActionSheet
        request={sheetFor}
        onClose={() => setSheetFor(null)}
        onSetStatus={quickAction}
        onPlayNext={(request) => void playNext(request)}
      />
    </>
  )
}

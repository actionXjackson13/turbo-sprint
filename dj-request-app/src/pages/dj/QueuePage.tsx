import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  EmptyState,
  NowPlayingCard,
  PageHeader,
  Section,
  SongRequestListSkeleton,
} from '../../components'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { getErrorMessage } from '../../utils/errors'
import type { SongRequest } from '../../types/domain'

/**
 * The play queue. Reordering uses explicit up/down controls rather than drag
 * and drop: they are reliable one-handed, work with a screen reader, and can't
 * be triggered accidentally while scrolling a long list on a phone.
 */
export function QueuePage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const service = useService()
  const toast = useToast()
  const { event, refresh } = useDjEvent()

  const { requests, loading, reload } = useEventRequests(eventId)
  const [busy, setBusy] = useState(false)

  const queue = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'queued')
        .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)),
    [requests],
  )

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= queue.length) return

    const reordered = [...queue]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved!)

    setBusy(true)
    try {
      await service.reorderQueue(
        eventId,
        reordered.map((r) => r.id),
      )
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const playNow = async (request: SongRequest) => {
    setBusy(true)
    try {
      await service.setNowPlaying(eventId, {
        title: request.title,
        artist: request.artist,
        sourceRequestId: request.id,
      })
      await Promise.all([refresh(), reload()])
      toast.success(`Now playing ${request.title}`)
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
        <Section title="Now playing">
          <NowPlayingCard
            nowPlaying={event?.nowPlaying ?? null}
            emptyHint="Tap “Play now” on a queued song to set it."
          >
            {event?.nowPlaying && (
              <AppButton
                variant="secondary"
                fullWidth
                disabled={busy}
                onClick={clearNowPlaying}
              >
                Clear
              </AppButton>
            )}
          </NowPlayingCard>
        </Section>

        <Section title="Up next">
          {loading && requests.length === 0 ? (
            <SongRequestListSkeleton count={2} />
          ) : queue.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Queue a request or push a vote winner here."
            />
          ) : (
            <ol className="space-y-3">
              {queue.map((request, index) => (
                <li key={request.id}>
                  <AppCard>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-600 text-xs font-bold tabular-nums text-fg-muted">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <h3 className="min-w-0 truncate text-base font-semibold text-fg">
                          {request.title}
                        </h3>
                        <p className="truncate text-sm text-fg-muted">
                          {request.artist}
                        </p>
                        <p className="mt-1 truncate text-xs text-fg-subtle">
                          {request.guestDisplayName} · {request.voteCount}{' '}
                          {request.voteCount === 1 ? 'vote' : 'votes'}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${request.title} up`}
                          disabled={busy || index === 0}
                          onClick={() => move(index, -1)}
                          className="flex size-11 items-center justify-center rounded-xl bg-ink-700 text-fg-muted disabled:opacity-40"
                        >
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
                            <path d="M18 15l-6-6-6 6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${request.title} down`}
                          disabled={busy || index === queue.length - 1}
                          onClick={() => move(index, 1)}
                          className="flex size-11 items-center justify-center rounded-xl bg-ink-700 text-fg-muted disabled:opacity-40"
                        >
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
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <AppButton
                        size="sm"
                        fullWidth
                        disabled={busy}
                        onClick={() => playNow(request)}
                      >
                        Play now
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="secondary"
                        fullWidth
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await service.updateRequestStatus(
                              request.id,
                              'played',
                            )
                            await reload()
                          } catch (err) {
                            toast.error(getErrorMessage(err))
                          }
                        }}
                      >
                        Mark played
                      </AppButton>
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

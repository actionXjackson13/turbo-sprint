import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AppButton,
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
import { usePlayNext } from '../../features/requests/usePlayNext'
import { QueueList } from './QueueList'
import { getErrorMessage } from '../../utils/errors'
import type { SongRequest } from '../../types/domain'

/**
 * The play queue.
 *
 * Reordering is a hold-then-drag on the grip, plus a position picker on the
 * number for longer moves — see QueueList. The hold is what makes dragging
 * safe inside a scrolling list, and the picker is what stops a move from
 * tenth to second being ten separate drags.
 */
export function QueuePage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const service = useService()
  const toast = useToast()
  const { event, refresh } = useDjEvent()

  const { requests, loading, reload } = useEventRequests(eventId)
  const [busy, setBusy] = useState(false)
  const { playNext, pendingId } = usePlayNext(eventId, reload)

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
   * Advance the night by one song, the same gesture the control panel offers.
   * Promoting a queued request also retires it from the queue, so this is the
   * whole "next track" move — and it lives at the top, next to what is on.
   */
  const startNextSong = async () => {
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
            emptyHint="Nothing playing yet."
          >
            <div className="space-y-2">
              <AppButton
                size="lg"
                fullWidth
                disabled={busy || queue.length === 0}
                onClick={() => void startNextSong()}
              >
                Play next song
              </AppButton>
              {event?.nowPlaying && (
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

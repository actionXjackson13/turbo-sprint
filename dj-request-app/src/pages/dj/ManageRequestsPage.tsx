import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  ConfirmationDialog,
  Toggle,
  EmptyState,
  PageHeader,
  SegmentedControl,
  SongRequestCard,
  SongRequestListSkeleton,
} from '../../components'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { usePlayNext } from '../../features/requests/usePlayNext'
import { useQueueRequest } from '../../features/requests/useQueueRequest'
import { useAutoAcceptState } from '../../hooks/useAutoAcceptState'
import { RequestActionSheet } from './RequestActionSheet'
import { CardActions } from './requestActions'
import { getErrorMessage } from '../../utils/errors'
import type { RequestSort, RequestStatus, SongRequest } from '../../types/domain'

const filters: { label: string; statuses: RequestStatus[] }[] = [
  { label: 'New', statuses: ['pending'] },
  { label: 'Accepted', statuses: ['accepted'] },
  { label: 'Queue', statuses: ['queued'] },
  { label: 'Done', statuses: ['played', 'declined'] },
]

export function ManageRequestsPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const service = useService()
  const toast = useToast()

  const [filterIndex, setFilterIndex] = useState(0)
  const [sort, setSort] = useState<RequestSort>('newest')
  const [sheetFor, setSheetFor] = useState<SongRequest | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<SongRequest | null>(null)
  const [confirmBlock, setConfirmBlock] = useState<SongRequest | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)

  // Load everything once and filter client-side so switching tabs is instant
  // and the counts stay accurate.
  const { requests, loading, reload } = useEventRequests(eventId, { sort })
  const { playNext, pendingId } = usePlayNext(eventId, reload)
  const { queueRequest } = useQueueRequest(eventId, reload)
  const autoAccept = useAutoAcceptState()

  const visible = useMemo(() => {
    const statuses = filters[filterIndex]!.statuses
    return requests.filter((r) => statuses.includes(r.status))
  }, [requests, filterIndex])

  const countFor = (index: number) =>
    requests.filter((r) => filters[index]!.statuses.includes(r.status)).length

  /**
   * Queueing is routed through `queueRequest` rather than a bare status write,
   * so a request lands ahead of the DJ's own songs instead of behind a set that
   * may be thirty tracks long. Every other status change is exactly what it
   * says.
   */
  const setStatus = async (requestId: string, status: RequestStatus) => {
    if (status === 'queued') {
      const request = requests.find((r) => r.id === requestId)
      if (request) return queueRequest(request)
    }
    try {
      await service.updateRequestStatus(requestId, status)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const removeRequest = async () => {
    if (!confirmRemove) return
    setDialogBusy(true)
    try {
      await service.deleteRequest(confirmRemove.id)
      await reload()
      toast.success('Request removed.')
      setConfirmRemove(null)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDialogBusy(false)
    }
  }

  const blockGuest = async () => {
    if (!confirmBlock?.guestId) return
    setDialogBusy(true)
    try {
      await service.setGuestBlocked(eventId, confirmBlock.guestId, true)
      await reload()
      toast.success(`${confirmBlock.guestDisplayName} can no longer request.`)
      setConfirmBlock(null)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDialogBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Requests"
        action={
          <SegmentedControl
            label="Order requests by"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'votes', label: 'Top voted' },
            ]}
          />
        }
      />

      {/*
        Above the filter rail rather than inside it: the rail chooses what you
        are looking at, and this decides whether you need to look at all.
      */}
      <div className="px-4 pt-4">
        <Toggle
          label="Auto accept"
          description={
            autoAccept.working > 0
              ? `Queueing ${autoAccept.working}…`
              : 'New requests go straight into the queue.'
          }
          checked={autoAccept.on}
          onChange={autoAccept.setOn}
        />
      </div>

      {/* Status filter rail */}
      <div className="sticky top-14 z-10 border-b border-hairline bg-ink-950/90 backdrop-blur">
        <div
          role="tablist"
          aria-label="Filter requests"
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3"
        >
          {filters.map((filter, index) => (
            <button
              key={filter.label}
              type="button"
              role="tab"
              aria-selected={filterIndex === index}
              onClick={() => setFilterIndex(index)}
              className={clsx(
                'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
                filterIndex === index
                  ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                  : 'border-hairline-strong bg-ink-800 text-fg-muted hover:text-fg',
              )}
            >
              {filter.label}
              <span className="tabular-nums opacity-70">
                {countFor(index)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-4">
        {loading && requests.length === 0 ? (
          <SongRequestListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description="Requests move between these tabs as you action them."
          />
        ) : (
          <div className="space-y-2">
            {visible.map((request) => (
              <SongRequestCard
                key={request.id}
                request={request}
                showVoteCount
                onMore={() => setSheetFor(request)}
                actions={
                  <CardActions
                    request={request}
                    playNextPending={pendingId === request.id}
                    onPlayNext={() => void playNext(request)}
                    onSetStatus={setStatus}
                  />
                }
              />
            ))}
          </div>
        )}
      </main>

      <RequestActionSheet
        request={sheetFor}
        onClose={() => setSheetFor(null)}
        onSetStatus={setStatus}
        onPlayNext={(request) => void playNext(request)}
        onRemove={setConfirmRemove}
        onBlock={setConfirmBlock}
      />

      <ConfirmationDialog
        open={confirmRemove !== null}
        title="Remove this request?"
        description={
          confirmRemove
            ? `"${confirmRemove.title}" and its votes will be deleted for everyone.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        loading={dialogBusy}
        onConfirm={removeRequest}
        onCancel={() => setConfirmRemove(null)}
      />

      <ConfirmationDialog
        open={confirmBlock !== null}
        title={`Block ${confirmBlock?.guestDisplayName ?? 'this guest'}?`}
        description="They won't be able to send more requests at this event. Their existing requests stay."
        confirmLabel="Block"
        destructive
        loading={dialogBusy}
        onConfirm={blockGuest}
        onCancel={() => setConfirmBlock(null)}
      />
    </>
  )
}

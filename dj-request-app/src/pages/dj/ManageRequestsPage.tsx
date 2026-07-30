import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AppButton,
  ConfirmationDialog,
  EmptyState,
  PageHeader,
  SongRequestCard,
  SongRequestListSkeleton,
} from '../../components'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useEventRequests } from '../../features/requests/useEventRequests'
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
  const [confirmRemove, setConfirmRemove] = useState<SongRequest | null>(null)
  const [confirmBlock, setConfirmBlock] = useState<SongRequest | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)

  // Load everything once and filter client-side so switching tabs is instant
  // and the counts stay accurate.
  const { requests, loading, reload } = useEventRequests(eventId, { sort })

  const visible = useMemo(() => {
    const statuses = filters[filterIndex]!.statuses
    return requests.filter((r) => statuses.includes(r.status))
  }, [requests, filterIndex])

  const countFor = (index: number) =>
    requests.filter((r) => filters[index]!.statuses.includes(r.status)).length

  const setStatus = async (requestId: string, status: RequestStatus) => {
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
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => setSort(sort === 'newest' ? 'votes' : 'newest')}
          >
            {sort === 'newest' ? 'Newest' : 'Top voted'}
          </AppButton>
        }
      />

      {/* Status filter rail */}
      <div className="sticky top-14 z-10 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
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
                  : 'border-ink-600 bg-ink-800 text-fg-muted hover:text-fg',
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
          <div className="space-y-3">
            {visible.map((request) => (
              <SongRequestCard
                key={request.id}
                request={request}
                actions={
                  <RequestActions
                    request={request}
                    onSetStatus={setStatus}
                    onRemove={() => setConfirmRemove(request)}
                    onBlock={() => setConfirmBlock(request)}
                  />
                }
              />
            ))}
          </div>
        )}
      </main>

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

/** Actions vary by status so the DJ only sees the moves that make sense. */
function RequestActions({
  request,
  onSetStatus,
  onRemove,
  onBlock,
}: {
  request: SongRequest
  onSetStatus: (id: string, status: RequestStatus) => void
  onRemove: () => void
  onBlock: () => void
}) {
  return (
    <>
      {request.status === 'pending' && (
        <>
          <AppButton
            size="sm"
            variant="success"
            onClick={() => onSetStatus(request.id, 'queued')}
          >
            Queue
          </AppButton>
          <AppButton
            size="sm"
            variant="secondary"
            onClick={() => onSetStatus(request.id, 'accepted')}
          >
            Accept
          </AppButton>
          <AppButton
            size="sm"
            variant="ghost"
            onClick={() => onSetStatus(request.id, 'declined')}
          >
            Decline
          </AppButton>
        </>
      )}

      {request.status === 'accepted' && (
        <>
          <AppButton
            size="sm"
            variant="success"
            onClick={() => onSetStatus(request.id, 'queued')}
          >
            Queue
          </AppButton>
          <AppButton
            size="sm"
            variant="ghost"
            onClick={() => onSetStatus(request.id, 'declined')}
          >
            Decline
          </AppButton>
        </>
      )}

      {request.status === 'queued' && (
        <>
          <AppButton
            size="sm"
            variant="success"
            onClick={() => onSetStatus(request.id, 'played')}
          >
            Mark played
          </AppButton>
          <AppButton
            size="sm"
            variant="secondary"
            onClick={() => onSetStatus(request.id, 'accepted')}
          >
            Unqueue
          </AppButton>
        </>
      )}

      {(request.status === 'played' || request.status === 'declined') && (
        <AppButton
          size="sm"
          variant="secondary"
          onClick={() => onSetStatus(request.id, 'pending')}
        >
          Reopen
        </AppButton>
      )}

      <AppButton size="sm" variant="ghost" onClick={onRemove}>
        Remove
      </AppButton>

      {/* Winners promoted from a vote have no guest to block. */}
      {request.guestId && (
        <AppButton size="sm" variant="ghost" onClick={onBlock}>
          Block guest
        </AppButton>
      )}
    </>
  )
}

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { haptic } from '../../utils/haptics'
import {
  getEventRequestsSnapshot,
  reloadEventRequests,
  reloadEventRequestsIfStale,
  selectRequests,
  subscribeEventRequests,
} from './eventRequestsStore'
import type { RequestSort, RequestStatus, SongRequest } from '../../types/domain'

export interface EventRequestsState {
  requests: SongRequest[]
  /** Request ids the current guest has voted for. */
  myVotes: Set<string>
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Ids with a vote request in flight, for disabling the control. */
  pendingVotes: Set<string>
  toggleVote: (request: SongRequest, isOwn: boolean) => Promise<void>
}

/**
 * An event's requests, in whatever order and selection this screen wants.
 *
 * Every caller gets the same underlying list — see `eventRequestsStore` for why
 * that matters — and shapes it here. The hook's shape has not changed; what has
 * changed is that three screens asking for it now cost one request instead of
 * six.
 *
 * Vote toggling stays centralised here so every list behaves the same.
 */
export function useEventRequests(
  eventId: string,
  opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
): EventRequestsState {
  const service = useService()
  const toast = useToast()
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(new Set())

  const sort = opts?.sort
  // Serialised so the memo below is stable across renders even though the
  // caller passes a fresh array each time.
  const statusKey = opts?.statuses?.join(',') ?? ''

  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeEventRequests(service, eventId, onChange),
    [service, eventId],
  )

  const snapshot = useSyncExternalStore(subscribe, () =>
    getEventRequestsSnapshot(service, eventId),
  )

  const reload = useCallback(
    () => reloadEventRequests(service, eventId),
    [service, eventId],
  )

  /**
   * Catching up after a spell with nobody watching.
   *
   * The store keeps its rows when the last screen unmounts, so a tab switch
   * paints instantly instead of on a skeleton. Those rows may be stale if the
   * DJ was away for a while — but a tab switch is not, on its own, a reason to
   * ask again, so this only refreshes rows old enough to be worth doubting.
   */
  useEffect(() => {
    reloadEventRequestsIfStale(service, eventId)
  }, [service, eventId])

  const requests = useMemo(() => {
    const rows = snapshot.data?.requests
    if (!rows) return []
    const statuses = statusKey
      ? (statusKey.split(',') as RequestStatus[])
      : undefined
    return selectRequests(rows, { sort, statuses })
  }, [snapshot.data, sort, statusKey])

  const myVotes = useMemo(
    () => new Set(snapshot.data?.votes ?? []),
    [snapshot.data],
  )

  const toggleVote = useCallback(
    async (request: SongRequest, isOwn: boolean) => {
      // The submitter's founding vote is permanent; the UI locks it, and the
      // backend rejects it too.
      if (isOwn && myVotes.has(request.id)) return

      setPendingVotes((prev) => new Set(prev).add(request.id))
      // Confirms the tap landed without asking a guest to watch for a colour
      // change in a dark, loud room.
      haptic('tap')
      try {
        if (myVotes.has(request.id)) {
          await service.removeRequestVote(request.id)
        } else {
          await service.voteRequest(request.id)
        }
        await reload()
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setPendingVotes((prev) => {
          const next = new Set(prev)
          next.delete(request.id)
          return next
        })
      }
    },
    [service, myVotes, reload, toast],
  )

  return {
    requests,
    myVotes,
    // Only a first load is a loading state. A refresh behind a list already on
    // screen is not something to interrupt the DJ with.
    loading: snapshot.loading && !snapshot.data,
    error: snapshot.error,
    reload,
    pendingVotes,
    toggleVote,
  }
}

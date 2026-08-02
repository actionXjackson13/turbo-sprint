import { useCallback, useMemo, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useLiveData } from '../../hooks/useAsyncData'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { haptic } from '../../utils/haptics'
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
 * Loads an event's requests together with the current guest's votes, and keeps
 * both live. Vote toggling is centralised here so every list behaves the same.
 */
export function useEventRequests(
  eventId: string,
  opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
): EventRequestsState {
  const service = useService()
  const toast = useToast()
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(new Set())

  const sort = opts?.sort
  // Serialise the status filter so the loader identity is stable across
  // renders even though the caller passes a fresh array each time.
  const statusKey = opts?.statuses?.join(',') ?? ''

  const loader = useCallback(async () => {
    const statuses = statusKey
      ? (statusKey.split(',') as RequestStatus[])
      : undefined
    const [requests, votes] = await Promise.all([
      service.listSongRequests(eventId, { sort, statuses }),
      service.getMyRequestVotes(eventId),
    ])
    return { requests, votes }
  }, [service, eventId, sort, statusKey])

  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeSongRequests(eventId, onChange),
    [service, eventId],
  )

  const { data, loading, error, reload } = useLiveData(loader, subscribe)

  const myVotes = useMemo(
    () => new Set(data?.votes ?? []),
    [data?.votes],
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
    requests: data?.requests ?? [],
    myVotes,
    loading,
    error,
    reload,
    pendingVotes,
    toggleVote,
  }
}

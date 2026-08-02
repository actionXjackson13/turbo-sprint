import { useCallback } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import type { RequestStatus } from '../../types/domain'

const confirmations: Partial<Record<RequestStatus, string>> = {
  queued: 'Added to the queue.',
  accepted: 'Accepted.',
  declined: 'Declined.',
  played: 'Marked as played.',
  pending: 'Reopened.',
}

/**
 * Moving a request between statuses, with the toast the DJ needs to know it
 * landed. Both DJ screens drive the same set of moves, so the error handling
 * and the wording live in one place rather than being retyped per button.
 */
export function useRequestStatus(reload: () => Promise<void>) {
  const service = useService()
  const toast = useToast()

  return useCallback(
    async (requestId: string, status: RequestStatus) => {
      try {
        await service.updateRequestStatus(requestId, status)
        await reload()
        const message = confirmations[status]
        if (message) toast.success(message)
      } catch (err) {
        toast.error(getErrorMessage(err))
      }
    },
    [service, reload, toast],
  )
}

import { AppButton } from '../../components'
import type { RequestStatus, SongRequest } from '../../types/domain'

export interface CardActionsProps {
  request: SongRequest
  playNextPending: boolean
  onPlayNext: () => void
  onSetStatus: (id: string, status: RequestStatus) => void
}

/**
 * The one or two moves worth a tap straight from a list.
 *
 * Both DJ screens show requests, so they show the same buttons — and the More
 * sheet asks this module what is already on the card so it never repeats it.
 */
export function CardActions({
  request,
  playNextPending,
  onPlayNext,
  onSetStatus,
}: CardActionsProps) {
  if (request.status === 'played' || request.status === 'declined') {
    return (
      <AppButton
        size="sm"
        variant="secondary"
        onClick={() => onSetStatus(request.id, 'pending')}
      >
        Reopen
      </AppButton>
    )
  }

  return (
    <>
      <AppButton size="sm" loading={playNextPending} onClick={onPlayNext}>
        Play Next
      </AppButton>
      {request.status !== 'queued' && (
        <AppButton
          size="sm"
          variant="secondary"
          onClick={() => onSetStatus(request.id, 'queued')}
        >
          Add to Queue
        </AppButton>
      )}
    </>
  )
}

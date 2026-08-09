import { useCallback, useMemo, useState } from 'react'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { queueOrderMainFirst, mainCountOf } from './queueOrdering'
import type { SongRequest } from '../../types/domain'

export interface UndoLastPlayedState {
  /** The song that would come back, or null when there is nothing to undo. */
  candidate: SongRequest | null
  undo: () => Promise<void>
  busy: boolean
}

/**
 * Putting back the song that just left.
 *
 * Skipping is one tap and irreversible, and the two commonest reasons to press
 * it are both mistakes: a thumb on the wrong button, and a song that turned out
 * to be a bad YouTube match rather than a bad song. Either way the request is
 * marked played, drops out of the queue, and the only way back was for someone
 * to request it again.
 *
 * It returns to the *front* of the main half rather than to where it was. It
 * was playing a moment ago, so the room is expecting it — putting it eleventh
 * would be a different decision than the one the DJ is trying to reverse.
 */
export function useUndoLastPlayed(
  eventId: string,
  requests: SongRequest[],
  onDone: () => Promise<void> | void,
): UndoLastPlayedState {
  const service = useService()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  /**
   * The most recently played song, by when it was played rather than when it
   * was asked for — `updatedAt` moves when the DJ acts on a request, which is
   * exactly the moment being undone.
   */
  const candidate = useMemo(() => {
    const played = requests.filter((r) => r.status === 'played')
    if (played.length === 0) return null
    return played.reduce((latest, r) =>
      r.updatedAt > latest.updatedAt ? r : latest,
    )
  }, [requests])

  const undo = useCallback(async () => {
    if (!candidate) return
    setBusy(true)
    try {
      await service.updateRequestStatus(candidate.id, 'queued')
      // Back to the main half, since it was moments from playing.
      await service.setQueueGroup(candidate.id, 'main')

      const queued = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      const rest = queueOrderMainFirst(queued).filter(
        (id) => id !== candidate.id,
      )
      await service.reorderQueue(
        eventId,
        [candidate.id, ...rest],
        // The queue was re-read *after* the song rejoined main, so the count
        // already includes it — adding one here would drag the first backdrop
        // song up with it.
        mainCountOf(queued),
      )

      await onDone()
      toast.success(`${candidate.title} is back at the front.`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [service, eventId, candidate, onDone, toast])

  return { candidate, undo, busy }
}

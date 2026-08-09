import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppButton, AppCard, EmptyState, LoadingSkeleton } from '../../components'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useAsyncData } from '../../hooks/useAsyncData'
import { skippedMessage } from '../../features/requests/duplicates'
import { getErrorMessage } from '../../utils/errors'

export interface LoadSetDialogProps {
  open: boolean
  eventId: string
  onClose: () => void
  onLoaded: () => Promise<void> | void
}

/**
 * Dropping a whole set into tonight's queue.
 *
 * A sheet rather than a screen: it is one decision, taken mid-party, and the
 * DJ should land back on the queue they were already looking at rather than
 * navigating away from it and back.
 */
export function LoadSetDialog({
  open,
  eventId,
  onClose,
  onLoaded,
}: LoadSetDialogProps) {
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const loader = useCallback(() => service.listDjSets(), [service])
  const { data: sets, loading } = useAsyncData(loader)
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (!open) return null

  const load = async (setId: string, name: string) => {
    setPendingId(setId)
    try {
      const { added, skipped } = await service.loadSetIntoQueue(eventId, setId)
      await onLoaded()
      // Say what was skipped as well as what landed: a set of twenty that adds
      // three is alarming unless you can see why.
      const note = skippedMessage(added, skipped)
      toast.success(
        note ??
          (added === 0
            ? `${name} is empty — nothing to add.`
            : `${added} ${added === 1 ? 'song' : 'songs'} from ${name} added.`),
      )
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative mx-auto flex max-h-[85dvh] w-full max-w-shell flex-col rounded-t-3xl border-t border-hairline bg-ink-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 className="text-title font-bold text-fg">Load a set</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Its songs go to the back of the queue. Requests stay ahead of them.
        </p>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loading && !sets ? (
            <div className="space-y-2">
              <LoadingSkeleton className="h-14" />
              <LoadingSkeleton className="h-14" />
            </div>
          ) : !sets || sets.length === 0 ? (
            <EmptyState
              title="No sets yet"
              description="Build one and it will be here every night."
              action={
                <AppButton
                  variant="secondary"
                  onClick={() => navigate(routes.dj.sets)}
                >
                  Make a set
                </AppButton>
              }
            />
          ) : (
            <ul className="space-y-2">
              {sets.map((set) => (
                <li key={set.id}>
                  <button
                    type="button"
                    className="w-full"
                    disabled={pendingId !== null || set.songs.length === 0}
                    onClick={() => void load(set.id, set.name)}
                  >
                    <AppCard className="flex items-center gap-3 text-left disabled:opacity-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-row font-semibold text-fg">
                          {set.name}
                        </p>
                        <p className="text-meta text-fg-muted">
                          {set.songs.length}{' '}
                          {set.songs.length === 1 ? 'song' : 'songs'}
                        </p>
                      </div>
                      {pendingId === set.id && (
                        <span
                          className="size-5 shrink-0 animate-spin rounded-full border-2 border-brand-400 border-t-transparent"
                          aria-label="Loading"
                        />
                      )}
                    </AppCard>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <AppButton
            variant="secondary"
            fullWidth
            onClick={() => navigate(routes.dj.sets)}
          >
            Manage sets
          </AppButton>
          <AppButton variant="ghost" fullWidth onClick={onClose}>
            Cancel
          </AppButton>
        </div>
      </div>
    </div>
  )
}

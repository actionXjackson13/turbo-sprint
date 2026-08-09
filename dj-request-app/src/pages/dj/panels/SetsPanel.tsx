import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  AppInput,
  EmptyState,
  LoadingSkeleton,
} from '../../../components'
import { routes } from '../../../lib/router'
import { useService } from '../../../hooks/useService'
import { useToast } from '../../../hooks/useToast'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { skippedMessage } from '../../../features/requests/duplicates'
import { getErrorMessage } from '../../../utils/errors'

export interface SetsPanelProps {
  /**
   * When present, each set can be dropped straight into this event's queue —
   * the thing a DJ actually wants mid-party. Omitted on the standalone screen,
   * which is for building sets between nights.
   */
  eventId?: string
  onLoaded?: () => Promise<void> | void
}

/**
 * The DJ's sets, wherever sets are shown.
 *
 * Shared between the Features tab and the standalone screen off the dashboard,
 * so the two cannot drift — building a set is the same job whether or not a
 * party is running, and only what you can *do* with one differs.
 */
export function SetsPanel({ eventId, onLoaded }: SetsPanelProps) {
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const loader = useCallback(() => service.listDjSets(), [service])
  const { data: sets, loading, reload } = useAsyncData(loader)

  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const set = await service.createDjSet(name)
      setName('')
      await reload()
      // Straight into it — naming a set is not the job, filling it is.
      navigate(routes.dj.set(set.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const load = async (setId: string, setName: string) => {
    if (!eventId) return
    setPendingId(setId)
    try {
      const { added, skipped } = await service.loadSetIntoQueue(eventId, setId)
      await onLoaded?.()
      const note = skippedMessage(added, skipped)
      toast.success(
        note ??
          (added === 0
            ? `${setName} is empty — nothing to add.`
            : `${added} ${added === 1 ? 'song' : 'songs'} from ${setName} added.`),
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <AppInput
            label="New set"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Warm-up, Peak hour…"
            maxLength={60}
          />
        </div>
        <AppButton
          loading={creating}
          disabled={!name.trim()}
          onClick={() => void create()}
        >
          Create
        </AppButton>
      </div>

      {loading && !sets ? (
        <div className="space-y-2">
          <LoadingSkeleton className="h-16" />
          <LoadingSkeleton className="h-16" />
        </div>
      ) : !sets || sets.length === 0 ? (
        <EmptyState
          title="No sets yet"
          description="Build a list above, then drop the whole thing into a queue in one tap."
        />
      ) : (
        <ul className="space-y-2">
          {sets.map((set) => (
            <li key={set.id}>
              <AppCard className="space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => navigate(routes.dj.set(set.id))}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-row font-semibold text-fg">
                      {set.name}
                    </p>
                    <p className="text-meta text-fg-muted">
                      {set.songs.length}{' '}
                      {set.songs.length === 1 ? 'song' : 'songs'}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="size-4 shrink-0 text-fg-subtle"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>

                {/* Only inside a party: there is no queue to load into from the
                    standalone screen, and a button that cannot work is worse
                    than no button. */}
                {eventId && (
                  <AppButton
                    fullWidth
                    size="sm"
                    loading={pendingId === set.id}
                    disabled={set.songs.length === 0 || pendingId !== null}
                    onClick={() => void load(set.id, set.name)}
                  >
                    {set.songs.length === 0
                      ? 'Empty'
                      : 'Add to tonight’s queue'}
                  </AppButton>
                )}
              </AppCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

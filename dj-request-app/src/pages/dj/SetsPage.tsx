import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  AppInput,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useAsyncData } from '../../hooks/useAsyncData'
import { getErrorMessage } from '../../utils/errors'

/**
 * The DJ's sets.
 *
 * Outside any event, and deliberately so. A set is built on a Tuesday for a
 * Friday, reused the Friday after that, and tweaked between the two — tying it
 * to an event would mean rebuilding the same list every time, which is the
 * whole thing this exists to avoid.
 */
export function SetsPage() {
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const loader = useCallback(() => service.listDjSets(), [service])
  const { data: sets, loading, reload } = useAsyncData(loader)

  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

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

  return (
    <RootLayout>
      <PageHeader
        title="My sets"
        subtitle="Lists you can drop into any night"
        showBack
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <AppInput
              label="New set"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Warm-up, Peak hour, Last hour…"
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
            description="Build a list of songs above, then drop the whole thing into a queue in one tap."
          />
        ) : (
          <ul className="space-y-2">
            {sets.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  className="w-full"
                  onClick={() => navigate(routes.dj.set(set.id))}
                >
                  <AppCard className="flex items-center gap-3 text-left">
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
                  </AppCard>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </RootLayout>
  )
}

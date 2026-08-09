import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlbumArt,
  AppButton,
  AppCard,
  AppInput,
  ConfirmationDialog,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useAsyncData } from '../../hooks/useAsyncData'
import { SongSearch } from '../../features/catalog/SongSearch'
import { getErrorMessage } from '../../utils/errors'
import type { DjSet } from '../../types/domain'

/**
 * Building one set.
 *
 * The same search the guests use, on purpose. A set assembled from typed-in
 * titles would carry no artwork and no catalogue identity, so the songs would
 * arrive in the queue as bare text and the player would have to guess at each
 * one — the exact problem search was introduced to solve, reappearing on the
 * screen where the DJ does the most typing.
 */
export function SetEditorPage() {
  const { setId = '' } = useParams<{ setId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const loader = useCallback(() => service.getDjSet(setId), [service, setId])
  const { data: set, loading, reload } = useAsyncData(loader)

  const [term, setTerm] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const apply = async (work: () => Promise<DjSet | void>, id?: string) => {
    setPendingId(id ?? null)
    try {
      await work()
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  const startRename = () => {
    setName(set?.name ?? '')
    setRenaming(true)
  }

  const saveName = async () => {
    if (!name.trim()) return
    await apply(() => service.renameDjSet(setId, name))
    setRenaming(false)
  }

  /** Swap two neighbours and persist the whole order. */
  const move = async (from: number, to: number) => {
    if (!set || to < 0 || to >= set.songs.length) return
    const ids = set.songs.map((s) => s.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved!)
    await apply(() => service.reorderSetSongs(setId, ids))
  }

  const duplicate = async () => {
    if (!set) return
    try {
      const copy = await service.duplicateDjSet(setId, `${set.name} copy`)
      toast.success(`Copied to “${copy.name}”.`)
      navigate(routes.dj.set(copy.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await service.deleteDjSet(setId)
      toast.success('Set deleted.')
      navigate(routes.dj.sets, { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err))
      setDeleting(false)
    }
  }

  if (loading && !set) {
    return (
      <RootLayout>
        <div className="flex-1 space-y-3 p-4 pt-safe">
          <LoadingSkeleton className="h-8 w-1/2" />
          <LoadingSkeleton className="h-24" />
        </div>
      </RootLayout>
    )
  }

  if (!set) {
    return (
      <RootLayout>
        <PageHeader title="Set" showBack />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="Set unavailable"
            description="It may have been deleted, or it belongs to another DJ."
          />
        </div>
      </RootLayout>
    )
  }

  return (
    <RootLayout>
      <PageHeader
        title={set.name}
        subtitle={`${set.songs.length} ${set.songs.length === 1 ? 'song' : 'songs'}`}
        showBack
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        {renaming ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <AppInput
                label="Set name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            <AppButton disabled={!name.trim()} onClick={() => void saveName()}>
              Save
            </AppButton>
          </div>
        ) : (
          <AppButton variant="secondary" fullWidth onClick={startRename}>
            Rename set
          </AppButton>
        )}

        <SongSearch
          term={term}
          onTermChange={setTerm}
          onPick={(song) =>
            void apply(
              () =>
                service.addSongToSet(setId, {
                  title: song.title,
                  artist: song.artist,
                  catalogId: song.id,
                  artworkUrl: song.artworkUrl,
                  catalogUrl: song.catalogUrl,
                }),
              song.id,
            )
          }
          onTypeItIn={() => setTerm('')}
          hint="Search for songs to build this set."
          pendingId={pendingId}
        />

        <section>
          <p className="text-label uppercase text-fg-subtle">In this set</p>
          {set.songs.length === 0 ? (
            <p className="mt-2 text-sm text-fg-muted">
              Nothing yet. Search above to add the first song.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {set.songs.map((song, index) => (
                <li key={song.id}>
                  <AppCard className="flex items-center gap-3 !py-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-600 text-xs font-bold tabular-nums text-fg-muted">
                      {index + 1}
                    </span>
                    <AlbumArt url={song.artworkUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">
                        {song.title}
                      </p>
                      <p className="truncate text-xs text-fg-muted">
                        {song.artist}
                      </p>
                    </div>
                    {/*
                      Up and down rather than a drag: a set is built sitting
                      down, between nights, where precision beats speed — and
                      the hold-then-drag the live queue uses exists to survive
                      a moving list, which this is not.
                    */}
                    <div className="flex shrink-0 items-center gap-1">
                      <AppButton
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${song.title} up`}
                        disabled={index === 0 || pendingId !== null}
                        onClick={() => void move(index, index - 1)}
                      >
                        ↑
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${song.title} down`}
                        disabled={
                          index === set.songs.length - 1 || pendingId !== null
                        }
                        onClick={() => void move(index, index + 1)}
                      >
                        ↓
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        loading={pendingId === song.id}
                        onClick={() =>
                          void apply(
                            () => service.removeSongFromSet(setId, song.id),
                            song.id,
                          )
                        }
                      >
                        Remove
                      </AppButton>
                    </div>
                  </AppCard>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Most sets are a variation on another — the same warm-up with three
            swaps for a different room. */}
        <AppButton variant="secondary" fullWidth onClick={() => void duplicate()}>
          Duplicate this set
        </AppButton>

        <AppButton
          variant="danger"
          fullWidth
          onClick={() => setConfirmDelete(true)}
        >
          Delete set
        </AppButton>
      </main>

      <ConfirmationDialog
        open={confirmDelete}
        title={`Delete “${set.name}”?`}
        description="The set and its songs are removed. Nights you have already played are untouched."
        confirmLabel="Delete set"
        destructive
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </RootLayout>
  )
}
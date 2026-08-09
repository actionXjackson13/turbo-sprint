import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlbumArt,
  AppButton,
  AppCard,
  AppInput,
  PageHeader,
} from '../../components'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { SongSearch } from '../../features/catalog/SongSearch'
import { FIELD_LIMITS } from '../../data/constants'
import { validateArtist, validateSongTitle } from '../../utils/validation'
import { getErrorMessage } from '../../utils/errors'
import type { CatalogSong } from '../../services/catalog/appleCatalog'
import type { SongRequest } from '../../types/domain'

/**
 * The DJ's own songs.
 *
 * Everything in the queue until now arrived by being asked for — a guest's
 * request or a vote the room won. A DJ had no way to put their own track in
 * their own queue: the song they wanted to open with had to be typed into
 * somebody's phone, or played outside the app where the room's screens would
 * never show it.
 *
 * Songs land queued rather than pending, and the screen stays put after each
 * one. Building an opening set is several songs in a row, and a page that
 * returned to the queue after every single one would make that six round trips
 * instead of one sitting.
 */
export function AddSongPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const service = useService()
  const toast = useToast()

  const [term, setTerm] = useState('')
  /** Escape hatch when the catalogues do not have it — a local edit, a bootleg. */
  const [manual, setManual] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [errors, setErrors] = useState<{ title?: string; artist?: string }>({})
  const [pendingId, setPendingId] = useState<string | null>(null)

  /** What has gone in this sitting, newest first — the receipt for the work. */
  const [added, setAdded] = useState<SongRequest[]>([])

  const add = async (
    song: { title: string; artist: string } & Partial<CatalogSong>,
    key: string,
  ) => {
    setPendingId(key)
    try {
      const request = await service.addDjSong({
        eventId,
        title: song.title,
        artist: song.artist,
        catalogId: song.id ?? null,
        artworkUrl: song.artworkUrl ?? null,
        catalogUrl: song.catalogUrl ?? null,
      })
      setAdded((prev) => [request, ...prev])
      toast.success(`${request.title} added to the queue.`)
      return true
    } catch (err) {
      toast.error(getErrorMessage(err))
      return false
    } finally {
      setPendingId(null)
    }
  }

  const addTyped = async () => {
    const titleError = validateSongTitle(title)
    const artistError = validateArtist(artist)
    if (titleError || artistError) {
      setErrors({
        title: titleError ?? undefined,
        artist: artistError ?? undefined,
      })
      return
    }

    const ok = await add({ title: title.trim(), artist: artist.trim() }, 'manual')
    if (ok) {
      // Cleared rather than kept: the next song is a different song, and the
      // previous title sitting in the box is only ever in the way.
      setTitle('')
      setArtist('')
      setErrors({})
    }
  }

  return (
    <>
      <PageHeader
        title={manual ? 'Type a song' : 'Add a song'}
        subtitle="Goes straight into the queue"
        showBack
      />

      <main className="flex-1 px-4 py-5">
        {manual ? (
          <div className="space-y-3">
            <AppInput
              label="Song title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setErrors((prev) => ({ ...prev, title: undefined }))
              }}
              error={errors.title}
              maxLength={FIELD_LIMITS.songTitle}
              autoFocus
            />
            <AppInput
              label="Artist"
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value)
                setErrors((prev) => ({ ...prev, artist: undefined }))
              }}
              error={errors.artist}
              maxLength={FIELD_LIMITS.artist}
            />
            <AppButton
              size="lg"
              fullWidth
              loading={pendingId === 'manual'}
              onClick={() => void addTyped()}
            >
              Add to queue
            </AppButton>
            <AppButton
              variant="ghost"
              fullWidth
              onClick={() => setManual(false)}
            >
              Back to search
            </AppButton>
          </div>
        ) : (
          <SongSearch
            term={term}
            onTermChange={setTerm}
            onPick={(song) => void add(song, song.id)}
            onTypeItIn={() => setManual(true)}
            hint="Search for a song to drop into the queue yourself."
            autoFocus
            pendingId={pendingId}
          />
        )}

        {added.length > 0 && (
          <section className="mt-7">
            <p className="text-label uppercase text-fg-subtle">
              Added this session
            </p>
            <ul className="mt-2 space-y-2">
              {added.map((request) => (
                <li key={request.id}>
                  <AppCard className="flex items-center gap-3 !py-3">
                    <AlbumArt url={request.artworkUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">
                        {request.title}
                      </p>
                      <p className="truncate text-xs text-fg-muted">
                        {request.artist}
                      </p>
                    </div>
                  </AppCard>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}

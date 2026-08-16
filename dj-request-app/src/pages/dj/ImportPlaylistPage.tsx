import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppButton, AppCard, AppInput, PageHeader } from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { lookupAppleSongs } from '../../services/catalog/appleLookup'
import type { CatalogSong } from '../../services/catalog/appleCatalog'

/**
 * A whole playlist into a set, from a link.
 *
 * Building a set a song at a time is fine for six and absurd for sixty, and a
 * DJ already has their night arranged in Apple Music. This is the shortcut:
 * paste the playlist's share link and the set arrives built.
 *
 * The flow is deliberately two-stage — read it, look at it, then keep it —
 * rather than one button that silently creates something. An import can come
 * back with a track Apple no longer sells, or with the wrong playlist entirely
 * if the wrong link was copied, and both are much easier to notice before the
 * set exists than after.
 */

type Stage =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'looking'; done: number; total: number }
  | { step: 'found'; songs: CatalogSong[]; missing: number }
  | { step: 'saving'; done: number; total: number }

export function ImportPlaylistPage() {
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>({ step: 'idle' })

  const busy = stage.step !== 'idle' && stage.step !== 'found'

  const read = async () => {
    setError(null)
    setStage({ step: 'reading' })
    try {
      const playlist = await service.importApplePlaylist(url.trim())

      setStage({ step: 'looking', done: 0, total: playlist.songIds.length })
      const songs = await lookupAppleSongs(playlist.songIds, (p) =>
        setStage({ step: 'looking', done: p.done, total: p.total }),
      )

      if (songs.length === 0) {
        setStage({ step: 'idle' })
        setError('Apple had nothing for the songs on that playlist.')
        return
      }

      // Only overwrite a name the DJ has not typed over.
      setName((current) => current.trim() || playlist.name || 'Imported set')
      setStage({
        step: 'found',
        songs,
        missing: playlist.songIds.length - songs.length,
      })
    } catch (err) {
      setStage({ step: 'idle' })
      setError(getErrorMessage(err))
    }
  }

  const save = async () => {
    if (stage.step !== 'found') return
    const songs = stage.songs

    setStage({ step: 'saving', done: 0, total: songs.length })
    try {
      const set = await service.createDjSet(name.trim() || 'Imported set')

      // One at a time, in order: each song's position is decided by when it
      // was added, and a set should open in the order the playlist had it.
      for (const [index, song] of songs.entries()) {
        await service.addSongToSet(set.id, {
          title: song.title,
          artist: song.artist,
          catalogId: song.id,
          artworkUrl: song.artworkUrl,
          catalogUrl: song.catalogUrl,
        })
        setStage({ step: 'saving', done: index + 1, total: songs.length })
      }

      toast.success(`Imported ${songs.length} songs.`)
      navigate(routes.dj.set(set.id), { replace: true })
    } catch (err) {
      setStage({ step: 'found', songs, missing: 0 })
      setError(getErrorMessage(err))
    }
  }

  return (
    <RootLayout>
      <PageHeader
        title="Import a playlist"
        subtitle="From an Apple Music share link"
        showBack
      />

      <main className="flex-1 space-y-6 px-4 py-5">
        <AppInput
          label="Playlist link"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          placeholder="https://music.apple.com/…/playlist/…"
          hint="In Apple Music: open the playlist, tap Share, then Copy Link."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />

        <AppCard>
          <p className="text-meta text-fg-muted">
            The playlist has to be shared before its link will open for anyone
            else — in Apple Music, tap the three dots on the playlist and turn
            on sharing. Nothing is added to your Apple Music account; the songs
            are copied into a set here.
          </p>
        </AppCard>

        {error && (
          <p role="alert" className="text-sm text-danger-500">
            {error}
          </p>
        )}

        {stage.step === 'reading' && (
          <p className="text-sm text-fg-muted">Reading the playlist…</p>
        )}
        {stage.step === 'looking' && (
          <p className="text-sm text-fg-muted">
            Looking up songs… {stage.done} of {stage.total}
          </p>
        )}
        {stage.step === 'saving' && (
          <p className="text-sm text-fg-muted">
            Saving… {stage.done} of {stage.total}
          </p>
        )}

        {stage.step === 'found' ? (
          <>
            <AppInput
              label="Set name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />

            <section className="space-y-2">
              <h2 className="text-label uppercase text-fg-subtle">
                {stage.songs.length} songs found
                {stage.missing > 0 && ` · ${stage.missing} skipped`}
              </h2>

              <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-ink-900">
                {stage.songs.map((song) => (
                  <li key={song.id} className="flex items-center gap-3 px-3 py-2">
                    {song.artworkUrl ? (
                      <img
                        src={song.artworkUrl}
                        alt=""
                        className="size-9 shrink-0 rounded"
                        loading="lazy"
                      />
                    ) : (
                      <span className="size-9 shrink-0 rounded bg-ink-800" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-row text-fg">
                        {song.title}
                      </span>
                      <span className="block truncate text-meta text-fg-muted">
                        {song.artist}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {stage.missing > 0 && (
                <p className="text-meta text-fg-subtle">
                  Songs Apple no longer has in its catalogue were left out. Add
                  them by hand if you need them.
                </p>
              )}
            </section>

            <AppButton size="lg" fullWidth onClick={() => void save()}>
              Save as a set
            </AppButton>
          </>
        ) : (
          <AppButton
            size="lg"
            fullWidth
            loading={busy}
            disabled={url.trim() === ''}
            onClick={() => void read()}
          >
            Read playlist
          </AppButton>
        )}
      </main>
    </RootLayout>
  )
}

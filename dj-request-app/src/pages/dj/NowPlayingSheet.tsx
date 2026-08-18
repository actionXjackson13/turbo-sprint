import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppButton, AppInput } from '../../components'
import { useDialogBehavior } from '../../hooks/useDialogBehavior'
import { SongSearch } from '../../features/catalog/SongSearch'
import { FIELD_LIMITS } from '../../data/constants'
import { validateArtist, validateSongTitle } from '../../utils/validation'
import type { CatalogSong } from '../../services/catalog/appleCatalog'

export interface NowPlayingPick {
  title: string
  artist: string
  /** Catalogue id when it came from search — used to find the request it retires. */
  id?: string | null
  artworkUrl?: string | null
}

export interface NowPlayingSheetProps {
  open: boolean
  onPick: (song: NowPlayingPick) => void
  onClose: () => void
  saving?: boolean
}

/**
 * Saying what is on the speakers right now.
 *
 * Until this existed the only song a DJ could name was whichever one happened
 * to be top of the queue. That is fine for an app playing its own queue, and
 * useless for a real set: most of what a DJ plays is their own, chosen in the
 * moment, and never went near the request list. So the whole night's
 * now-playing was either wrong or blank, and the guests' screens — the reason
 * they are looking at their phones at all — said nothing.
 *
 * Search first, typing second, because the search gets artwork and a catalogue
 * id: artwork is what makes a guest's screen worth looking at, and the id is
 * what lets a played request be retired from the queue automatically. Typing is
 * always reachable in one tap for the bootleg, the edit and the white label
 * that no catalogue has ever heard of.
 *
 * Both modes live in one sheet rather than a sheet plus a screen: this is a
 * thing done mid-mix, with one hand, in the two bars before the drop.
 */
export function NowPlayingSheet({
  open,
  onPick,
  onClose,
  saving = false,
}: NowPlayingSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [term, setTerm] = useState('')
  const [typing, setTyping] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [errors, setErrors] = useState<{ title?: string; artist?: string }>({})

  // Every opening is a fresh question. The last song's title sitting in the box
  // is only ever in the way of naming this one.
  useEffect(() => {
    if (!open) return
    setTerm('')
    setTyping(false)
    setTitle('')
    setArtist('')
    setErrors({})
  }, [open])

  useDialogBehavior({ open, panelRef, onDismiss: onClose })

  if (!open || typeof document === 'undefined') return null

  const submitTyped = () => {
    const titleError = validateSongTitle(title)
    const artistError = validateArtist(artist)
    if (titleError || artistError) {
      setErrors({
        title: titleError ?? undefined,
        artist: artistError ?? undefined,
      })
      return
    }
    onPick({ title: title.trim(), artist: artist.trim() })
  }

  const pickFromCatalog = (song: CatalogSong) => {
    onPick({
      title: song.title,
      artist: song.artist,
      id: song.id,
      artworkUrl: song.artworkUrl,
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-playing-sheet-title"
        // Tall and scrolling internally: a results list that grew the sheet
        // would push its own results off the bottom of the screen.
        className="relative mx-auto flex max-h-[85vh] w-full max-w-shell flex-col rounded-t-3xl border-t border-hairline bg-ink-800 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-500" />
          <h2
            id="now-playing-sheet-title"
            className="text-lg font-bold text-fg"
          >
            What’s on now?
          </h2>
          <p className="mt-1 text-meta text-fg-muted">
            Everyone in the room sees this.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4">
          {typing ? (
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
                loading={saving}
                onClick={submitTyped}
              >
                Set as now playing
              </AppButton>
              <AppButton
                variant="ghost"
                fullWidth
                onClick={() => setTyping(false)}
              >
                Back to search
              </AppButton>
            </div>
          ) : (
            <SongSearch
              term={term}
              onTermChange={setTerm}
              onPick={pickFromCatalog}
              onTypeItIn={() => setTyping(true)}
              autoFocus
              hint="Search for whatever you’ve just dropped."
            />
          )}
        </div>

        {!typing && (
          <div className="shrink-0 px-5 pt-3">
            <AppButton variant="ghost" size="lg" fullWidth onClick={onClose}>
              Cancel
            </AppButton>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

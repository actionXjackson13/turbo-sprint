import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from '../../components'
import { useDialogBehavior } from '../../hooks/useDialogBehavior'
import { SongSearch } from '../../features/catalog/SongSearch'
import type { CatalogSong } from '../../services/catalog/appleCatalog'

export interface SongPickerSheetProps {
  open: boolean
  onPick: (song: CatalogSong) => void
  /** The catalogue does not have everything; this hands the slot back. */
  onTypeItIn: () => void
  onClose: () => void
}

/**
 * The guest's song search, in a sheet, for filling one slot of a vote.
 *
 * A sheet rather than a screen because the DJ is part-way through building
 * something: pushing them to another page and back for each of two to four
 * options would lose the shape of the thing they are assembling.
 *
 * The search inside is the component the guest's request screen uses, not a
 * copy of it — the whole point of this change was that the two screens should
 * not differ.
 */
export function SongPickerSheet({
  open,
  onPick,
  onTypeItIn,
  onClose,
}: SongPickerSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [term, setTerm] = useState('')

  // A fresh slot starts a fresh search; the last one's results are not an
  // answer to this one's question.
  useEffect(() => {
    if (open) setTerm('')
  }, [open])

  useDialogBehavior({ open, panelRef, onDismiss: onClose })

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close song search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-picker-title"
        // Tall, and scrolls internally: this is a results list, and a sheet
        // that grows with its contents would push them off the screen.
        className="relative mx-auto flex max-h-[85vh] w-full max-w-shell flex-col rounded-t-3xl border-t border-hairline bg-ink-800 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-500" />
          <h2 id="song-picker-title" className="text-lg font-bold text-fg">
            Pick a song
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3">
          <SongSearch
            term={term}
            onTermChange={setTerm}
            onPick={onPick}
            onTypeItIn={onTypeItIn}
            autoFocus
            hint="Search the same catalogue guests request from."
          />
        </div>

        <div className="shrink-0 px-5 pt-3">
          <AppButton variant="ghost" size="lg" fullWidth onClick={onClose}>
            Cancel
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

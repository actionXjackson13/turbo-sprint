import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from './AppButton'

export interface ConfirmationDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm action as destructive. */
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Mobile bottom-sheet style confirmation. Implements the modal essentials by
 * hand (no dialog dependency): focus is moved in on open, restored on close,
 * kept inside while open, and Escape cancels.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()

    // Prevent the page behind the sheet from scrolling on mobile.
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return

      // Cycle focus within the panel.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
      previouslyFocused.current?.focus()
    }
  }, [open, onCancel])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-desc' : undefined}
        className="relative mx-auto w-full max-w-shell rounded-t-3xl border-t border-ink-600 bg-ink-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-500" />
        <h2 id="confirm-title" className="text-lg font-bold text-fg">
          {title}
        </h2>
        {description && (
          <div id="confirm-desc" className="mt-2 text-sm text-fg-muted">
            {description}
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <AppButton
            ref={confirmRef}
            variant={destructive ? 'danger' : 'primary'}
            size="lg"
            fullWidth
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AppButton>
          <AppButton
            variant="ghost"
            size="lg"
            fullWidth
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

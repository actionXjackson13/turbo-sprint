import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from './AppButton'
import { useDialogBehavior } from '../hooks/useDialogBehavior'

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

/** Mobile bottom-sheet style confirmation. */
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

  useDialogBehavior({
    open,
    panelRef,
    initialFocusRef: confirmRef,
    onDismiss: onCancel,
  })

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
        className="relative mx-auto w-full max-w-shell rounded-t-3xl border-t border-hairline bg-ink-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
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

import { createPortal } from 'react-dom'
import clsx from 'clsx'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastRecord {
  id: string
  message: string
  variant: ToastVariant
}

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-success-500/40 bg-ink-700 text-fg',
  error: 'border-danger-500/50 bg-ink-700 text-fg',
  info: 'border-hairline-strong bg-ink-700 text-fg',
}

const variantIcons: Record<ToastVariant, string> = {
  success: 'M20 6L9 17l-5-5',
  error: 'M12 8v5M12 16h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 16v-4M12 8h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
}

const variantIconColor: Record<ToastVariant, string> = {
  success: 'text-success-500',
  error: 'text-danger-500',
  info: 'text-accent-400',
}

export interface ToastViewportProps {
  toasts: ToastRecord[]
  onDismiss: (id: string) => void
}

/**
 * Fixed stack of toasts, portalled to <body> so it is never clipped by a
 * scrolling container. Sits above the bottom nav.
 */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-shell flex-col gap-2 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
      // Announce new toasts without stealing focus.
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'pointer-events-auto flex items-start gap-3 rounded-control border p-3 shadow-lg',
            variantStyles[toast.variant],
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={clsx('mt-0.5 size-5 shrink-0', variantIconColor[toast.variant])}
            aria-hidden="true"
          >
            <path d={variantIcons[toast.variant]} />
          </svg>
          <p className="min-w-0 flex-1 text-sm leading-snug break-words">
            {toast.message}
          </p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:bg-ink-600 hover:text-fg"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

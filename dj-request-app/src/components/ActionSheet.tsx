import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useDialogBehavior } from '../hooks/useDialogBehavior'

export interface ActionSheetItem {
  label: string
  onSelect: () => void
  /** Marks an irreversible action — the only place red is used in a list. */
  destructive?: boolean
  disabled?: boolean
}

export interface ActionSheetProps {
  open: boolean
  title: string
  description?: string
  items: ActionSheetItem[]
  onClose: () => void
  children?: ReactNode
}

/**
 * The overflow menu for a card.
 *
 * Cards were rendering every possible action inline, which put up to seven
 * buttons under one song and made the two that matter impossible to find. The
 * common moves stay on the card; everything else lives here, one tap away, as
 * a full-width stacked list that is comfortable to hit one-handed.
 */
export function ActionSheet({
  open,
  title,
  description,
  items,
  onClose,
  children,
}: ActionSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogBehavior({ open, panelRef, onDismiss: onClose })

  if (!open || typeof document === 'undefined') return null

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
        aria-labelledby="action-sheet-title"
        className="relative mx-auto flex max-h-[80dvh] w-full max-w-shell flex-col rounded-t-3xl border-t border-hairline bg-ink-800 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-ink-500" />

        <div className="shrink-0 px-1 pb-2">
          <h2
            id="action-sheet-title"
            className="truncate text-base font-bold text-fg"
          >
            {title}
          </h2>
          {description && (
            <p className="truncate text-sm text-fg-muted">{description}</p>
          )}
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {children}
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect()
                    onClose()
                  }}
                  className={clsx(
                    // Each row carries its own surface and edge. Flat text on
                    // the sheet did not read as something you could tap.
                    'flex min-h-12 w-full items-center rounded-control border px-3 text-left',
                    'text-base font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    item.destructive
                      ? 'border-danger-500/40 bg-danger-500/10 text-danger-500 hover:bg-danger-500/20'
                      : 'border-hairline-strong bg-ink-700 text-fg hover:bg-ink-600',
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-12 shrink-0 rounded-control border border-hairline text-base font-semibold text-fg-muted hover:bg-ink-700 hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}

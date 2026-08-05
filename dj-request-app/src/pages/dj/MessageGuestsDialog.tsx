import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { AppButton } from '../../components'
import { useDialogBehavior } from '../../hooks/useDialogBehavior'
import {
  ANNOUNCEMENT_CUSTOM_DURATIONS,
  ANNOUNCEMENT_QUICK_DURATIONS,
  FIELD_LIMITS,
} from '../../data/constants'

export interface MessageGuestsDialogProps {
  open: boolean
  /** The message currently up, so the DJ can see and clear it. */
  current: { message: string } | null
  sending: boolean
  onSend: (message: string, durationSeconds: number) => void
  onClear: () => void
  onCancel: () => void
}

/**
 * Writing a note to the room.
 *
 * A sheet rather than a screen: this is a sentence and a duration, typed
 * mid-set with one hand, and pushing the DJ through a page transition to say
 * "last orders in ten minutes" would be the wrong weight of ceremony.
 *
 * The duration is picked, never typed, at either level. A DJ choosing one
 * with a drink in the other hand wants to tap, and no party needs a message
 * timed to the second.
 *
 * Three quick options and everything else behind **Custom**, because a message
 * is nearly always about the next few minutes. A row wide enough to cover
 * every case would have made the common answer slower to reach.
 */
export function MessageGuestsDialog({
  open,
  current,
  sending,
  onSend,
  onClear,
  onCancel,
}: MessageGuestsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [message, setMessage] = useState('')
  const [seconds, setSeconds] = useState(ANNOUNCEMENT_QUICK_DURATIONS[1]!.seconds)
  const [pickingCustom, setPickingCustom] = useState(false)

  // Start from whatever is up, so editing a live message is the obvious move.
  useEffect(() => {
    if (open) {
      setMessage(current?.message ?? '')
      setPickingCustom(false)
    }
  }, [open, current])

  useDialogBehavior({
    open,
    panelRef,
    initialFocusRef: inputRef,
    onDismiss: onCancel,
  })

  if (!open || typeof document === 'undefined') return null

  const trimmed = message.trim()
  const remaining = FIELD_LIMITS.announcement - message.length
  const custom = ANNOUNCEMENT_CUSTOM_DURATIONS.find(
    (option) => option.seconds === seconds,
  )

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-guests-title"
        className="relative mx-auto w-full max-w-shell rounded-t-3xl border-t border-hairline bg-ink-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-500" />
        <h2 id="message-guests-title" className="text-lg font-bold text-fg">
          Message guests
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Shows above the current song on every guest's phone, then disappears
          on its own.
        </p>

        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FIELD_LIMITS.announcement}
          rows={3}
          placeholder="Last orders in 10 minutes!"
          className={clsx(
            'mt-4 w-full resize-none rounded-control border border-hairline-strong',
            'bg-ink-900 p-3 text-sm text-fg placeholder:text-fg-subtle',
            'focus:border-brand-500 focus:outline-none',
          )}
        />
        <p className="mt-1 text-right text-meta text-fg-subtle">
          {remaining} left
        </p>

        <fieldset className="mt-3">
          <legend className="text-label uppercase text-fg-subtle">
            Show for
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {ANNOUNCEMENT_QUICK_DURATIONS.map((option) => (
              <DurationChip
                key={option.seconds}
                label={option.label}
                selected={seconds === option.seconds}
                onClick={() => {
                  setSeconds(option.seconds)
                  setPickingCustom(false)
                }}
              />
            ))}

            {/* The overflow. Shows the chosen value rather than the word
                "Custom" once one is picked, so the row still reads as an
                answer to "show for" at a glance. */}
            <div className="relative">
              <DurationChip
                label={custom?.label ?? 'Custom'}
                selected={custom !== undefined}
                menu
                expanded={pickingCustom}
                onClick={() => setPickingCustom((v) => !v)}
              />

              {pickingCustom && (
                <div
                  role="menu"
                  aria-label="Choose how long to show the message"
                  // Opens upward: this sheet sits at the bottom of the screen,
                  // so anything below the row is off it.
                  className="absolute right-0 bottom-full z-10 mb-1 w-max rounded-card border border-hairline-strong bg-ink-700 p-1.5 shadow-xl shadow-black/60"
                >
                  {ANNOUNCEMENT_CUSTOM_DURATIONS.map((option) => (
                    <button
                      key={option.seconds}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSeconds(option.seconds)
                        setPickingCustom(false)
                      }}
                      className={clsx(
                        'block min-h-11 w-full rounded-control px-4 text-sm font-medium transition-colors',
                        seconds === option.seconds
                          ? 'bg-brand-500/20 text-brand-400'
                          : 'text-fg hover:bg-ink-600',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </fieldset>

        <div className="mt-5 flex flex-col gap-2">
          <AppButton
            size="lg"
            fullWidth
            loading={sending}
            disabled={trimmed.length === 0}
            onClick={() => onSend(trimmed, seconds)}
          >
            {current ? 'Replace message' : 'Send to guests'}
          </AppButton>

          {/* Only offered when there is something to take down. */}
          {current && (
            <AppButton
              variant="secondary"
              size="lg"
              fullWidth
              disabled={sending}
              onClick={onClear}
            >
              Clear message
            </AppButton>
          )}

          <AppButton
            variant="ghost"
            size="lg"
            fullWidth
            disabled={sending}
            onClick={onCancel}
          >
            Cancel
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface DurationChipProps {
  label: string
  selected: boolean
  /** Draws the caret and wires the menu semantics. */
  menu?: boolean
  expanded?: boolean
  onClick: () => void
}

/** One duration option. Shared so the Custom button matches the quick ones. */
function DurationChip({
  label,
  selected,
  menu = false,
  expanded = false,
  onClick,
}: DurationChipProps) {
  return (
    <button
      type="button"
      aria-pressed={menu ? undefined : selected}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? expanded : undefined}
      onClick={onClick}
      className={clsx(
        'flex min-h-11 w-full items-center justify-center gap-0.5 rounded-control border px-1',
        'text-meta font-medium transition-colors',
        selected || expanded
          ? 'border-brand-500 bg-brand-500/20 text-fg'
          : 'border-hairline bg-ink-900 text-fg-muted',
      )}
    >
      <span className="truncate">{label}</span>
      {menu && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(
            'size-3 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </button>
  )
}

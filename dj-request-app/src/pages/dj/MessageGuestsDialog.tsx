import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { AppButton } from '../../components'
import { useDialogBehavior } from '../../hooks/useDialogBehavior'
import { ANNOUNCEMENT_DURATIONS, FIELD_LIMITS } from '../../data/constants'

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
 * The duration is picked, never typed. Every option is short — a message that
 * outlasts the reason for it becomes clutter above the thing guests actually
 * came to see, and a DJ running a party will not remember to come back and
 * clear it.
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
  const [seconds, setSeconds] = useState(ANNOUNCEMENT_DURATIONS[1]!.seconds)

  // Start from whatever is up, so editing a live message is the obvious move.
  useEffect(() => {
    if (open) setMessage(current?.message ?? '')
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
            {ANNOUNCEMENT_DURATIONS.map((option) => (
              <button
                key={option.seconds}
                type="button"
                aria-pressed={seconds === option.seconds}
                onClick={() => setSeconds(option.seconds)}
                className={clsx(
                  'min-h-11 rounded-control border text-meta font-medium transition-colors',
                  seconds === option.seconds
                    ? 'border-brand-500 bg-brand-500/20 text-fg'
                    : 'border-hairline bg-ink-900 text-fg-muted',
                )}
              >
                {option.label}
              </button>
            ))}
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

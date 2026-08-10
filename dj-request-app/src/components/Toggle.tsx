import clsx from 'clsx'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** The visible label. Also what a screen reader announces. */
  label: string
  /** One line under the label, for what turning it on actually does. */
  description?: string
  disabled?: boolean
  className?: string
}

/**
 * A setting that is on or off.
 *
 * `role="switch"` rather than a styled checkbox: the two are announced
 * differently, and "switch" is the one that means a state taking effect
 * immediately rather than a choice submitted later — which is exactly what
 * every toggle in this app does.
 *
 * The whole row is the control, not just the track. A 44px target is the floor
 * for a thumb, and the track alone is nowhere near it.
 */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex w-full items-center gap-3 rounded-card border p-3 text-left',
        'transition-colors disabled:opacity-50',
        checked
          ? 'border-success-500/50 bg-success-500/10'
          : 'border-hairline bg-ink-900',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {description && (
          <span className="mt-0.5 block text-meta text-fg-muted">
            {description}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className={clsx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-success-500' : 'bg-ink-600',
        )}
      >
        <span
          className={clsx(
            // A bordered knob rather than a bare white one: on a light theme the
// track behind it is pale too, and an unedged white circle disappears
// into it.
'absolute top-1 size-5 rounded-full border border-hairline bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}

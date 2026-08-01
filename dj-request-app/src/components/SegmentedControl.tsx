import clsx from 'clsx'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  /** Labels the group for screen readers — the visible heading is usually enough visually. */
  label: string
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * Two or three mutually exclusive views of the same list.
 *
 * Replaces the pattern of stacking those views as separate sections, which is
 * what made the request screens repeat themselves — the same songs appeared
 * twice under different headings. One list, and you pick how it is ordered.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx(
        'inline-flex rounded-full border border-ink-600 bg-ink-800 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={clsx(
              'min-h-8 rounded-full px-3 text-xs font-semibold transition-colors',
              selected
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

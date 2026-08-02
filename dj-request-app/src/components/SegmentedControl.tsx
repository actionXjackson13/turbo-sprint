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
      className={clsx('inline-flex rounded-full bg-ink-800 p-0.5', className)}
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
              'text-meta relative min-h-7 rounded-full px-3 font-medium transition-colors',
              // The chip stays visually slim while an invisible overlay gives
              // it a full 44px tap target. Thumbs need the height even when
              // the design doesn't show it.
              'after:absolute after:inset-x-0 after:top-1/2 after:h-11',
              'after:-translate-y-1/2 after:content-[""]',
              // The selected segment is a solid raised chip rather than a
              // tinted one, so which view you're in reads at a glance.
              // Unselected uses fg-muted, not fg-subtle: this chip sits on a
              // lighter surface, where subtle drops under the contrast floor.
              selected
                ? 'bg-ink-600 text-fg'
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

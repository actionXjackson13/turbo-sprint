import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * Settings, in the shape every phone already taught people to read.
 *
 * The screen had become a column of full-width buttons — brand purple, grey,
 * red, dashed — each one shouting at the same volume, which is no volume at
 * all. A button is a thing that *does* something now; most of what sits here is
 * a place to go, and drawing those as buttons made the two indistinguishable
 * and the one genuinely destructive action no louder than "All events".
 *
 * So: quiet rows in grouped cards, a chevron where tapping navigates, and
 * colour spent only where it means something.
 */

export interface SettingsGroupProps {
  /** Small caps heading above the group. Omit for an unlabelled group. */
  title?: string
  /** One line under the group, for what the whole group is for. */
  footer?: string
  children: ReactNode
}

export function SettingsGroup({ title, footer, children }: SettingsGroupProps) {
  return (
    <section>
      {title && (
        <h2 className="mb-2 px-1 text-label uppercase text-fg-subtle">
          {title}
        </h2>
      )}
      {/*
        One card, rows divided rather than separated. Gaps between rows would
        read as unrelated items; a shared edge reads as a group.
      */}
      <div className="overflow-hidden rounded-card border border-hairline bg-ink-900">
        {children}
      </div>
      {footer && (
        <p className="mt-2 px-1 text-meta text-fg-subtle">{footer}</p>
      )}
    </section>
  )
}

export interface SettingsRowProps {
  label: string
  /** Secondary line under the label. */
  description?: string
  /** Right-aligned value — a count, a code, a status. */
  value?: ReactNode
  onClick?: () => void
  /** Draws the row in red. For the one action that cannot be undone. */
  destructive?: boolean
  disabled?: boolean
  /** Suppresses the chevron on a row that acts rather than navigates. */
  showChevron?: boolean
}

export function SettingsRow({
  label,
  description,
  value,
  onClick,
  destructive = false,
  disabled = false,
  showChevron,
}: SettingsRowProps) {
  const interactive = Boolean(onClick) && !disabled
  // A chevron promises another screen, so it is only drawn where tapping opens
  // one — never on a row that acts in place.
  const chevron = showChevron ?? Boolean(onClick)

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={clsx(
            'block text-sm font-medium',
            destructive ? 'text-danger-500' : 'text-fg',
          )}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-meta text-fg-muted">
            {description}
          </span>
        )}
      </span>

      {value !== undefined && (
        <span className="shrink-0 text-sm text-fg-muted">{value}</span>
      )}

      {chevron && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-4 shrink-0 text-fg-subtle"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </>
  )

  // 52px minimum: a settings row is tapped one-handed, often while something
  // else is going on.
  const shape =
    'flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-3 text-left ' +
    'border-b border-hairline last:border-b-0'

  if (!interactive) {
    return (
      <div className={clsx(shape, disabled && 'opacity-50')}>{body}</div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(shape, 'transition-colors active:bg-ink-800')}
    >
      {body}
    </button>
  )
}

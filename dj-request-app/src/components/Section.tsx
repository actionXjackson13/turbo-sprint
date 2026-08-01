import { useId, type ReactNode } from 'react'
import clsx from 'clsx'

export interface SectionProps {
  title: string
  /** Rendered at the trailing edge of the heading row — a count, a toggle, a link. */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A labelled block of a screen.
 *
 * Every screen was hand-rolling the same heading markup, which is how the two
 * sides drifted into looking slightly different from each other. Putting it
 * here means a section looks the same wherever it appears, and the pages read
 * as a list of what they contain rather than a wall of utility classes.
 */
export function Section({ title, action, children, className }: SectionProps) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <h2
          id={headingId}
          className="text-xs font-semibold tracking-wide text-fg-subtle uppercase"
        >
          {title}
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export interface SectionLinkProps {
  onClick: () => void
  children: ReactNode
}

/** The "see everything" affordance a section uses in its action slot. */
export function SectionLink({ onClick, children }: SectionLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-semibold',
        'text-brand-400 hover:text-brand-500',
      )}
    >
      {children}
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

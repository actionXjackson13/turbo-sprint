import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'

export interface AppCardProps {
  children: ReactNode
  /** Renders as <section>/<li>/etc. so cards can sit in semantic lists. */
  as?: ElementType
  /** Lifts the surface for emphasis (now playing, active vote). */
  emphasis?: boolean
  padded?: boolean
  className?: string
}

export function AppCard({
  children,
  as: Tag = 'div',
  emphasis = false,
  padded = true,
  className,
}: AppCardProps) {
  return (
    <Tag
      className={clsx(
        'rounded-card border',
        emphasis
          ? 'border-brand-500/40 bg-ink-700'
          : 'border-ink-700 bg-ink-800',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

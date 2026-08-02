import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'

/**
 * How much the card should separate itself from the page.
 *
 * `raised` is the default and draws no outline at all — a slightly lighter
 * surface is enough to read as a distinct block, and dropping the border is
 * most of what stops a screen looking like a stack of boxes.
 */
export type CardTone = 'raised' | 'outlined' | 'plain' | 'accent'

export interface AppCardProps {
  children: ReactNode
  /** Renders as <section>/<li>/etc. so cards can sit in semantic lists. */
  as?: ElementType
  tone?: CardTone
  /** Shorthand for the accent tone, kept so existing screens keep working. */
  emphasis?: boolean
  padded?: boolean
  className?: string
}

const toneStyles: Record<CardTone, string> = {
  raised: 'bg-ink-900',
  outlined: 'bg-ink-900 border border-hairline',
  plain: '',
  // A tint plus a hairline, rather than a full-strength border, so the one
  // emphasised card on a screen leads without shouting.
  accent: 'bg-brand-500/8 border border-brand-500/25',
}

export function AppCard({
  children,
  as: Tag = 'div',
  tone,
  emphasis = false,
  padded = true,
  className,
}: AppCardProps) {
  const resolved: CardTone = tone ?? (emphasis ? 'accent' : 'raised')

  return (
    <Tag
      className={clsx(
        'rounded-card',
        toneStyles[resolved],
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

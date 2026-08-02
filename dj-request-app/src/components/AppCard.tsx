import type { ElementType, ReactNode } from 'react'
import clsx from 'clsx'

/**
 * How much the card should separate itself from the page.
 *
 * `raised` is the default and now draws an edge as well as lifting the
 * surface. Tone alone is enough on a bright screen indoors and not enough on a
 * phone at half brightness — the outline is what makes the block findable
 * without having to look for it.
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
  raised: 'bg-ink-900 border border-hairline',
  outlined: 'bg-ink-900 border border-hairline-strong',
  plain: '',
  // The one emphasised card on a screen leads on both counts: a stronger tint
  // and a brand-tinted edge.
  accent: 'bg-brand-500/12 border border-brand-500/45',
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

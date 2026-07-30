import type { ReactNode } from 'react'
import clsx from 'clsx'

export interface RootLayoutProps {
  children: ReactNode
  /** Reserves space for a fixed bottom navigation. */
  hasBottomNav?: boolean
  className?: string
}

/**
 * The app shell. On phones this is simply full-bleed; on tablet and desktop the
 * content is constrained to a centred phone-width column so the app keeps its
 * mobile character instead of stretching into a desktop page.
 */
export function RootLayout({
  children,
  hasBottomNav = false,
  className,
}: RootLayoutProps) {
  return (
    <div className="min-h-dvh bg-ink-950">
      <div
        className={clsx(
          'relative mx-auto flex min-h-dvh w-full max-w-shell flex-col',
          'bg-ink-950',
          // A subtle edge on large screens reads as a device frame.
          'sm:border-x sm:border-ink-800',
          hasBottomNav && 'pb-safe-nav',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

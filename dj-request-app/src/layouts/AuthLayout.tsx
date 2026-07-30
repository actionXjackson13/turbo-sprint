import type { ReactNode } from 'react'
import { RootLayout } from './RootLayout'

export interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Rendered at the bottom — typically the "switch to sign up" link. */
  footer?: ReactNode
}

/** Centred single-column layout for sign-in, sign-up and the join flow. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <RootLayout>
      <div className="flex flex-1 flex-col justify-center px-6 py-10 pt-safe">
        <div className="mb-8">
          <h1 className="text-3xl leading-tight font-bold text-fg">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-fg-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
      {footer && (
        <div className="px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </RootLayout>
  )
}

import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

export interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Shows a back affordance. Falls back to history.back() when no `to` given. */
  onBack?: () => void
  showBack?: boolean
  /** Rendered at the trailing edge — usually a single icon action. */
  action?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  showBack = false,
  action,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) onBack()
    else navigate(-1)
  }

  return (
    <header
      className={clsx(
        'sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur',
        'pt-safe',
        className,
      )}
    >
      <div className="flex min-h-14 items-center gap-2 px-4 py-2">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-ink-800 hover:text-fg"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl leading-tight font-bold text-fg">
            {title}
          </h1>
          {subtitle && (
            <div className="truncate text-sm text-fg-muted">{subtitle}</div>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}

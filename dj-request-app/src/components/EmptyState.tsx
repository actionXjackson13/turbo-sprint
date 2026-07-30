import type { ReactNode } from 'react'
import clsx from 'clsx'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  /** Optional call to action — omit rather than rendering a dead button. */
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <div className="space-y-1">
        <p className="text-base font-semibold text-fg">{title}</p>
        {description && (
          <p className="mx-auto max-w-xs text-sm text-fg-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

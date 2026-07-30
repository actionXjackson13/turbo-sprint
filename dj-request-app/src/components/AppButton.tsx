import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'md' | 'lg' | 'sm'

export interface AppButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant
  size?: Size
  /** Stretches to the container width — the default for primary mobile actions. */
  fullWidth?: boolean
  /** Shows a spinner and blocks interaction. */
  loading?: boolean
  leadingIcon?: ReactNode
  className?: string
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 disabled:bg-ink-600 disabled:text-fg-subtle',
  secondary:
    'bg-ink-700 text-fg hover:bg-ink-600 active:bg-ink-800 border border-ink-500 disabled:text-fg-subtle',
  ghost:
    'bg-transparent text-fg-muted hover:bg-ink-800 hover:text-fg active:bg-ink-700 disabled:text-fg-subtle',
  danger:
    'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-600 disabled:bg-ink-600 disabled:text-fg-subtle',
  success:
    'bg-success-500 text-ink-950 hover:brightness-110 active:brightness-95 disabled:bg-ink-600 disabled:text-fg-subtle',
}

// Every size clears the 44px minimum touch target required by the spec.
const sizeStyles: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-12 px-4 text-base gap-2',
  lg: 'min-h-14 px-5 text-lg gap-2.5',
}

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  function AppButton(
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      leadingIcon,
      disabled,
      children,
      className,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={clsx(
          'inline-flex items-center justify-center rounded-2xl font-semibold',
          'transition-colors duration-150 select-none',
          'disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : (
          leadingIcon
        )}
        {children}
      </button>
    )
  },
)

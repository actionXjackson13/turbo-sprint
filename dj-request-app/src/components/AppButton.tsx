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

/**
 * Only `primary` carries a solid fill; the rest are outlined instead. A quiet
 * surface with no edge stopped reading as a control at all on a phone, so
 * secondary and destructive actions are drawn with a border and let the fill
 * stay muted — still one obvious primary choice, but the alternatives are
 * visibly buttons.
 */
const variantStyles: Record<Variant, string> = {
  // brand-600 rather than brand-500: white on the lighter purple measured
  // 4.2:1, under the AA floor for small text. This sits at 5.7:1.
  primary:
    'bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-600 disabled:bg-ink-700 disabled:text-fg-subtle',
  secondary:
    'border border-hairline-strong bg-ink-800 text-fg hover:bg-ink-700 active:bg-ink-800 disabled:text-fg-subtle',
  ghost:
    'border border-transparent bg-transparent text-fg-muted hover:bg-ink-800 hover:text-fg active:bg-ink-700 disabled:text-fg-subtle',
  danger:
    'border border-danger-500/45 bg-danger-500/15 text-danger-500 hover:bg-danger-500/25 disabled:bg-ink-700 disabled:text-fg-subtle',
  success:
    'border border-success-500/45 bg-success-500/15 text-success-500 hover:bg-success-500/25 disabled:bg-ink-700 disabled:text-fg-subtle',
}

/**
 * Sizes are visually slimmer than before but every one still clears the 44px
 * minimum touch target — `sm` is 44px tall, it just carries less padding and
 * a lighter label.
 */
const sizeStyles: Record<Size, string> = {
  // 13px, not 12: these are the DJ's mid-set controls in a dark room, and
  // button labels are the last place to shave a pixel.
  sm: 'min-h-11 px-3 text-[0.8125rem] gap-1.5',
  md: 'min-h-12 px-4 text-sm gap-2',
  lg: 'min-h-13 px-5 text-base gap-2',
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
          'inline-flex items-center justify-center rounded-control font-medium',
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

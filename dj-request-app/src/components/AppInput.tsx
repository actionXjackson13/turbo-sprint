import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import clsx from 'clsx'

export interface AppInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string
  /** Validation message. Presence switches the field into its error state. */
  error?: string | undefined
  hint?: string
  /** Visually hides the label while keeping it available to screen readers. */
  hideLabel?: boolean
  className?: string
  containerClassName?: string
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  function AppInput(
    {
      label,
      error,
      hint,
      hideLabel = false,
      id,
      className,
      containerClassName,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    // Only reference description ids that are actually rendered, otherwise
    // screen readers announce a dangling reference.
    const describedBy =
      [error ? errorId : null, hint && !error ? hintId : null]
        .filter(Boolean)
        .join(' ') || undefined

    return (
      <div className={clsx('flex flex-col gap-1.5', containerClassName)}>
        <label
          htmlFor={inputId}
          className={clsx(
            'text-sm font-medium text-fg-muted',
            hideLabel && 'sr-only',
          )}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'min-h-12 w-full rounded-2xl border bg-ink-800 px-4 text-base text-fg',
            'placeholder:text-fg-subtle',
            'transition-colors duration-150',
            error
              ? 'border-danger-500'
              : 'border-ink-600 focus:border-brand-400',
            className,
          )}
          {...rest}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-danger-500">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-sm text-fg-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)

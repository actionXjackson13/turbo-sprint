import { useEffect, type RefObject } from 'react'

export interface UseDialogBehaviorOptions {
  open: boolean
  /** The dialog panel. Focus is confined to whatever it contains. */
  panelRef: RefObject<HTMLElement | null>
  /** Focused on open. Defaults to the panel's first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Called on Escape. */
  onDismiss: () => void
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The modal essentials, implemented by hand rather than pulled in as a
 * dependency: focus moves in on open and is restored on close, stays inside
 * while open, the page behind cannot scroll, and Escape dismisses.
 */
export function useDialogBehavior({
  open,
  panelRef,
  initialFocusRef,
  onDismiss,
}: UseDialogBehaviorOptions): void {
  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const first = () =>
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
    ;(initialFocusRef?.current ?? first())?.focus()

    // Prevent the page behind the sheet from scrolling on mobile.
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
        return
      }
      if (e.key !== 'Tab') return

      // Cycle focus within the panel.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        FOCUSABLE,
      )
      if (!focusables || focusables.length === 0) return
      const head = focusables[0]!
      const tail = focusables[focusables.length - 1]!

      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault()
        head.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
      previouslyFocused?.focus()
    }
  }, [open, panelRef, initialFocusRef, onDismiss])
}

/**
 * Light haptic feedback.
 *
 * The app is used one-handed in a dark, loud room where a toast may be missed
 * and a colour change is easy to overlook. A short buzz confirms a tap landed
 * without asking the user to look at anything.
 *
 * Deliberately quiet about failure: `navigator.vibrate` is absent on iOS
 * Safari and a no-op when the device is in silent mode, so every call is
 * best-effort and nothing depends on it.
 */

type Pattern = 'tap' | 'confirm' | 'warn'

const PATTERNS: Record<Pattern, number | number[]> = {
  /** A single action registered — a vote, a status change. */
  tap: 12,
  /** Something completed that the user cares about. */
  confirm: [10, 40, 18],
  /** A refusal: blocked, closed, at the cap. */
  warn: [22, 50, 22],
}

export function haptic(pattern: Pattern = 'tap'): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return

    // Respect a user who has asked the OS for less motion/stimulation.
    if (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Vibration is a nicety; never let it break an interaction.
  }
}

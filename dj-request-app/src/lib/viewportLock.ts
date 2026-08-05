/**
 * Keeps the app upright and at one scale.
 *
 * Both are real problems at a party rather than tidiness: a phone held loosely
 * in one hand gets pinched by the palm holding it, and someone leaning over a
 * table has their screen flip on them mid-request. Neither is a thing anyone
 * *meant* to do, and the way out of both is unobvious on a phone.
 *
 * Every layer here exists because the one above it does not work everywhere:
 *
 * - `user-scalable=no` in the viewport meta is honoured by Android, and has
 *   been deliberately ignored by iOS Safari since iOS 10.
 * - `touch-action: manipulation` (index.css) removes double-tap-to-zoom, and
 *   is honoured by both.
 * - The `gesture*` events below are WebKit's own, and preventing them is what
 *   actually stops a pinch on an iPhone.
 * - `orientation: portrait` in the manifest locks an installed Android app;
 *   the API call below covers fullscreen; iOS honours neither, which is why
 *   there is also a "turn your phone upright" screen — see RotateGate.
 *
 * The honest cost: pinch-to-zoom is an accessibility affordance, and this
 * takes it away. It is a deliberate trade for a screen people hold in a
 * crowd — the app's own type is large and its targets are 44px, so nothing
 * here depends on zooming to be usable.
 */

export function lockViewport(): void {
  if (typeof window === 'undefined') return

  /**
   * Safari's pinch gesture. Non-standard, WebKit-only, and the only thing that
   * stops a two-finger zoom on an iPhone — the viewport meta will not.
   */
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), {
      passive: false,
    })
  }

  /**
   * The same pinch as a plain touch sequence, for engines that report it that
   * way. Single-touch moves are untouched, so scrolling and the queue's
   * drag-to-reorder still work exactly as before.
   */
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault()
    },
    { passive: false },
  )

  /**
   * Best-effort portrait lock. Throws on any browser that does not allow it
   * outside fullscreen, and does not exist at all on iOS — the rejection is
   * the normal case, not an error worth reporting.
   */
  const orientation = window.screen?.orientation
  // Typed as required by TypeScript's DOM lib, absent at runtime on iOS.
  const lock = (
    orientation as { lock?: (orientation: string) => Promise<void> } | undefined
  )?.lock
  void lock?.call(orientation, 'portrait').catch(() => {})
}

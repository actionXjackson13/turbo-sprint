/**
 * "Turn your phone upright."
 *
 * The manifest locks orientation on an installed Android app and the
 * Screen Orientation API covers fullscreen, but iOS honours neither — a home
 * screen web app on an iPhone rotates with the device whatever anyone asks.
 * Since the app cannot stop the rotation there, it stops *being sideways*
 * instead, which is the part people were actually complaining about.
 *
 * Shown by media query rather than by listening for resize, so it is right
 * before React has done anything and cannot be caught out by a rotation that
 * happens mid-render.
 *
 * The height bound is what keeps this off tablets and laptops. A phone on its
 * side is under 500px tall; nothing else is, and a DJ running the queue on a
 * laptop in a booth must not be told to rotate a screen that does not turn.
 */
export function RotateGate() {
  return (
    <div
      className="rotate-gate fixed inset-0 z-[100] flex-col items-center justify-center gap-4 bg-ink-950 px-8 text-center"
      role="alertdialog"
      aria-label="Rotate your device"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-12 text-brand-400"
        aria-hidden="true"
      >
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
        <path d="M3.5 9.5a9 9 0 0 1 2-3.6" />
        <path d="M20.5 14.5a9 9 0 0 1-2 3.6" />
      </svg>

      <p className="text-title font-bold text-fg">Turn your phone upright</p>
      <p className="max-w-xs text-sm text-fg-muted">
        SoundBoard is built for one hand, so it only runs the tall way up.
      </p>
    </div>
  )
}

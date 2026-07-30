/**
 * Compact relative time for request feeds ("just now", "4m", "2h", "3d").
 * Deliberately terse — these appear in dense mobile cards.
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.floor((now.getTime() - then) / 1000)

  // Small negative drift between client and server clocks reads as "just now"
  // rather than a nonsensical future time.
  if (seconds < 45) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Formats a remaining-seconds count as `m:ss`, used by voting countdowns. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

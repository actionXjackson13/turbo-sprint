import { useCountdown } from '../hooks/useCountdown'
import type { Announcement } from '../types/domain'

export interface AnnouncementBannerProps {
  announcement: Announcement | null
}

/**
 * A short note from the DJ, above the current track.
 *
 * The things a DJ otherwise has to shout — last orders, requests closing, a
 * happy birthday — with the two properties that keep it from becoming
 * wallpaper: it is small, and it takes itself down.
 *
 * Deliberately smaller than the now-playing card it sits over. A message that
 * competed with the current track would win by novelty and lose the screen its
 * point; this is a notification, not a headline.
 */
export function AnnouncementBanner({ announcement }: AnnouncementBannerProps) {
  /**
   * Ticking locally means an expiring message disappears on time rather than
   * whenever the next refresh happens to land. The server still decides *when*
   * it expires — this only watches the clock run down.
   */
  const remaining = useCountdown(announcement?.expiresAt ?? null)

  if (!announcement || remaining === null || remaining <= 0) return null

  return (
    <aside
      role="status"
      className="flex gap-2.5 rounded-card border border-accent-400/45 bg-accent-500/12 p-3"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 size-4 shrink-0 text-accent-400"
        aria-hidden="true"
      >
        <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z" />
        <path d="M16 8.5a4 4 0 0 1 0 7" />
        <path d="M19 5.5a8 8 0 0 1 0 13" />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="text-label uppercase text-accent-400">
          Message from the DJ
        </p>
        {/* Wraps rather than truncates — a message nobody can finish reading
            is worse than one that costs a line of height. */}
        <p className="mt-1 text-sm break-words text-fg">
          {announcement.message}
        </p>
      </div>
    </aside>
  )
}

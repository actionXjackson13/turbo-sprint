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
 *
 * No icon. The label already says who it is from, and a glyph beside it only
 * repeated that in a second language while taking the width the message
 * itself wants.
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
      className="rounded-card border border-accent-400/45 bg-accent-500/12 p-3"
    >
      <div className="min-w-0">
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

import { useNavigate } from 'react-router-dom'
import { useParty } from '../hooks/useParty'
import { stopGuestPreview } from '../services/partySession'
import { routes } from '../lib/router'

/**
 * The way back, for the one person who has one.
 *
 * A DJ looking at their own party as a guest is otherwise stuck: every guest
 * screen is a guest screen, with no route back to the control panel, because a
 * real guest must never find one. What separates them is not a role the server
 * knows about — it is that this browser opened a second session on purpose, and
 * only this browser knows it did.
 *
 * Sits at the top rather than the bottom: the bottom belongs to the guest's own
 * navigation, and covering it would change the thing being looked at.
 */
export function GuestPreviewBar() {
  const navigate = useNavigate()
  const { previewingEventId } = useParty()

  if (!previewingEventId) return null

  return (
    <div className="sticky top-0 z-30 border-b border-hairline bg-status-pending/15 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-shell items-center gap-3 px-4 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-label uppercase text-status-pending">
            Guest’s view
          </span>
          <span className="block truncate text-meta text-fg-muted">
            You’re in your own party as a guest. Requests you send are real.
          </span>
        </span>

        <button
          type="button"
          onClick={() => {
            const eventId = previewingEventId
            stopGuestPreview()
            navigate(routes.dj.event(eventId), { replace: true })
          }}
          className={
            'shrink-0 rounded-control border border-hairline-strong bg-ink-800 ' +
            'px-3 py-2 text-meta font-medium text-fg active:bg-ink-700'
          }
        >
          Back to DJ
        </button>
      </div>
    </div>
  )
}

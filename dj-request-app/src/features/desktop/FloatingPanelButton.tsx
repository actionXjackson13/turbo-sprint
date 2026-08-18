import { createPortal } from 'react-dom'
import { AppButton } from '../../components'
import { OverlayPanelPage } from '../../pages/dj/OverlayPanelPage'
import { useFloatingPanel } from './useFloatingPanel'

/**
 * "Pop out" — and, when the browser renders the panel itself, the panel.
 *
 * Both live here because in the Picture-in-Picture case they are the same
 * React tree: the floating window is populated by portalling into it, not by
 * loading a second copy of the app. That is what keeps the panel on the same
 * session and the same live data as the window that opened it, with no second
 * sign-in and no second set of subscriptions.
 *
 * Rendered inside the DJ's event layout, so the portalled panel sits under the
 * providers it needs — the event, the service, the toasts — without any of them
 * knowing a second window exists.
 */
export function FloatingPanelButton({ eventId }: { eventId: string }) {
  const panel = useFloatingPanel(eventId)
  const open = panel.mode !== null

  // Nothing to offer a phone: there is no second window to put beside the
  // first, and no other app for a panel to float over.
  if (!panel.canFloat) return null

  return (
    <>
      <AppButton
        variant="secondary"
        fullWidth
        onClick={() => (open ? panel.close() : void panel.open())}
      >
        {open ? 'Close the panel' : 'Pop out a panel'}
      </AppButton>

      {panel.container &&
        createPortal(
          <div className="flex h-full flex-col overflow-hidden bg-ink-950 text-fg">
            <OverlayPanelPage container={panel.container} />
          </div>,
          panel.container,
        )}
    </>
  )
}

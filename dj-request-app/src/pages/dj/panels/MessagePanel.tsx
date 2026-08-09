import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppButton } from '../../../components'
import { useDjEvent } from '../../../hooks/useDjEvent'
import { useService } from '../../../hooks/useService'
import { useToast } from '../../../hooks/useToast'
import { getErrorMessage } from '../../../utils/errors'
import { MessageGuestsDialog } from '../MessageGuestsDialog'

/**
 * Saying something to the room.
 *
 * Moved out of Event settings, which is where it was least likely to be found:
 * this is a thing a DJ does *during* a party — last song in ten minutes, the
 * bar is closing, happy birthday to whoever — and it was filed among the
 * one-time set-up.
 */
export function MessagePanel() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const service = useService()
  const toast = useToast()
  const { event, refresh } = useDjEvent()

  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)

  /**
   * Whether a message is still showing, rather than merely set. The row keeps
   * the last one it was given until it is replaced, so this has to check the
   * clock the same way the guests' banner does.
   */
  const live =
    event?.announcement &&
    new Date(event.announcement.expiresAt).getTime() > Date.now()
      ? event.announcement
      : null

  const send = async (message: string, durationSeconds: number) => {
    setSending(true)
    try {
      await service.setAnnouncement(eventId, { message, durationSeconds })
      await refresh()
      setOpen(false)
      toast.success('Message sent to guests.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const clear = async () => {
    setSending(true)
    try {
      await service.setAnnouncement(eventId, null)
      await refresh()
      setOpen(false)
      toast.success('Message cleared.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        A short note appears above every guest's now-playing card for as long as
        you choose.
      </p>

      <AppButton
        variant={live ? 'secondary' : 'primary'}
        size="lg"
        fullWidth
        disabled={event?.status === 'ended'}
        onClick={() => setOpen(true)}
      >
        {live ? 'Change message' : 'Message guests'}
      </AppButton>

      {live && (
        <p className="rounded-control border border-accent-400/40 bg-accent-500/10 p-2.5 text-sm text-fg-muted">
          <span className="text-label uppercase text-accent-400">
            Showing now
          </span>
          <span className="mt-1 block break-words text-fg">{live.message}</span>
        </p>
      )}

      <MessageGuestsDialog
        open={open}
        current={live}
        sending={sending}
        onSend={(message, seconds) => void send(message, seconds)}
        onClear={() => void clear()}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}

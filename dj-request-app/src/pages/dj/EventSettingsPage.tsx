import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  AppInput,
  ConfirmationDialog,
  GuestManager,
  PageHeader,
  Section,
  StatusBadge,
} from '../../components'
import { routes } from '../../lib/router'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useDjAuth } from '../../hooks/useDjAuth'
import { validateEventName } from '../../utils/validation'
import { FIELD_LIMITS } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'
import { isDemoMode } from '../../lib/env'
import { resetDemoDb } from '../../services/demo/demoStore'
import { MessageGuestsDialog } from './MessageGuestsDialog'

export function EventSettingsPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()
  const { event, guestCount, refresh } = useDjEvent()
  const { signOut } = useDjAuth()

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)

  /**
   * Whether a message is still showing, rather than merely set. The row keeps
   * the last one it was given until it is replaced, so the dialog has to check
   * the clock the same way the guests' banner does.
   */
  const liveAnnouncement =
    event?.announcement &&
    new Date(event.announcement.expiresAt).getTime() > Date.now()
      ? event.announcement
      : null

  const sendMessage = async (message: string, durationSeconds: number) => {
    setSendingMessage(true)
    try {
      await service.setAnnouncement(eventId, { message, durationSeconds })
      await refresh()
      setMessaging(false)
      toast.success('Message sent to guests.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSendingMessage(false)
    }
  }

  const clearMessage = async () => {
    setSendingMessage(true)
    try {
      await service.setAnnouncement(eventId, null)
      await refresh()
      setMessaging(false)
      toast.success('Message cleared.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSendingMessage(false)
    }
  }

  // Seed the field once the event arrives, without clobbering later edits.
  useEffect(() => {
    if (event) setName(event.name)
  }, [event])

  const saveName = async (e: FormEvent) => {
    e.preventDefault()

    const validationError = validateEventName(name)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      await service.updateEventSettings(eventId, { name })
      await refresh()
      toast.success('Event name updated.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const endEvent = async () => {
    setEnding(true)
    try {
      await service.endEvent(eventId)
      toast.success('Event ended.')
      navigate(routes.dj.dashboard, { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err))
      setEnding(false)
    }
  }

  if (!event) return null

  return (
    <>
      <PageHeader title="Event settings" />

      <main className="flex-1 space-y-7 px-4 py-5">
        <form onSubmit={saveName} noValidate className="space-y-3">
          <AppInput
            label="Event name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            error={error ?? undefined}
            maxLength={FIELD_LIMITS.eventName}
            disabled={event.status === 'ended'}
          />
          <AppButton
            type="submit"
            fullWidth
            loading={saving}
            disabled={event.status === 'ended' || name === event.name}
          >
            Save name
          </AppButton>
        </form>

        <AppCard>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Event code</dt>
              <dd className="font-mono font-bold tracking-widest text-brand-400">
                {event.code}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Guests joined</dt>
              <dd className="font-semibold tabular-nums text-fg">
                {guestCount}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Requests</dt>
              <dd>
                <StatusBadge kind="intake" status={event.requestStatus} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Status</dt>
              <dd className="font-semibold text-fg">
                {event.status === 'active' ? 'Live' : 'Ended'}
              </dd>
            </div>
          </dl>
        </AppCard>

        {/* Above the guest list, because it is the other thing a DJ does to
            the room rather than to the queue. */}
        <Section title="Message guests">
          <AppButton
            variant={liveAnnouncement ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            disabled={event.status === 'ended'}
            onClick={() => setMessaging(true)}
          >
            {liveAnnouncement ? 'Change message' : 'Message guests'}
          </AppButton>

          {liveAnnouncement && (
            <p className="mt-2 rounded-control border border-accent-400/40 bg-accent-500/10 p-2.5 text-sm text-fg-muted">
              <span className="text-label uppercase text-accent-400">
                Showing now
              </span>
              <span className="mt-1 block break-words text-fg">
                {liveAnnouncement.message}
              </span>
            </p>
          )}
        </Section>

        <Section title={`Guests (${guestCount})`}>
          <GuestManager eventId={eventId} />
        </Section>

        {event.status === 'active' && (
          <AppButton
            variant="danger"
            size="lg"
            fullWidth
            onClick={() => setConfirmEnd(true)}
          >
            End event
          </AppButton>
        )}

        <AppButton
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => navigate(routes.dj.dashboard)}
        >
          All events
        </AppButton>

        <AppButton
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => {
            void signOut().then(() => navigate(routes.welcome))
          }}
        >
          Sign out
        </AppButton>

        {isDemoMode() && (
          <div className="rounded-control border border-dashed border-hairline-strong p-3">
            <p className="mb-2 text-center text-label text-fg-subtle uppercase">
              Demo mode
            </p>
            <AppButton
              variant="secondary"
              fullWidth
              onClick={() => {
                resetDemoDb()
                toast.success('Demo data reset.')
                navigate(routes.welcome)
              }}
            >
              Reset demo data
            </AppButton>
          </div>
        )}
      </main>

      <MessageGuestsDialog
        open={messaging}
        current={liveAnnouncement}
        sending={sendingMessage}
        onSend={(message, seconds) => void sendMessage(message, seconds)}
        onClear={() => void clearMessage()}
        onCancel={() => setMessaging(false)}
      />

      <ConfirmationDialog
        open={confirmEnd}
        title="End this event?"
        description="Requests close, any running vote is cancelled, and guests can no longer join. This can't be undone."
        confirmLabel="End event"
        destructive
        loading={ending}
        onConfirm={endEvent}
        onCancel={() => setConfirmEnd(false)}
      />
    </>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  AppInput,
  ConfirmationDialog,
  PageHeader,
  SettingsGroup,
  SettingsRow,
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
import { startGuestPreview, stopHosting } from '../../services/partySession'
import { hasYouTubeKey } from '../../services/player/playerSettings'
import { presetFor } from '../../features/theme/palette'
import type { EventTheme } from '../../types/domain'

/** Names the theme where it has a name, and says "custom" where it does not. */
function themeLabel(theme: EventTheme | null): string {
  const preset = presetFor(theme)
  if (preset) return preset.name
  return 'Custom colours'
}

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
  const [previewing, setPreviewing] = useState(false)

  /**
   * Walk in the front door of your own party.
   *
   * A genuine guest session rather than a rehearsal: the request form posts a
   * real request into the real queue, which is the only version of this worth
   * having — a preview that cannot do the thing being previewed answers none of
   * the questions you opened it to ask.
   */
  const enterGuestView = async () => {
    if (!event) return
    setPreviewing(true)
    try {
      await startGuestPreview(event.id, event.code, 'You (preview)')
      navigate(routes.guest.home(event.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
      setPreviewing(false)
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
      // Stop answering for it too. Leaving the code registered would keep a
      // finished party reachable, and hold the relay id against the next one.
      stopHosting()
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

        <SettingsGroup title="Music">
          <SettingsRow
            label="Where songs play from"
            description={
              hasYouTubeKey()
                ? 'In-app player is set up'
                : 'Set up the in-app player'
            }
            onClick={() => navigate(routes.dj.music(eventId))}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Look"
          footer="Colours apply to every guest's phone, not just yours."
        >
          <SettingsRow
            label="Theme"
            description={themeLabel(event.theme)}
            onClick={() => navigate(routes.dj.theme(eventId))}
          />
        </SettingsGroup>

        <SettingsGroup title="Party">
          <SettingsRow
            label="Guests"
            value={guestCount}
            onClick={() => navigate(routes.dj.guests(eventId))}
          />
          <SettingsRow
            label="The night"
            description="What played, and what the room wanted"
            onClick={() => navigate(routes.dj.summary(eventId))}
          />
          <SettingsRow
            label="See it as a guest"
            description="Join your own party and request a song"
            disabled={previewing}
            onClick={() => void enterGuestView()}
          />
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingsRow
            label="All events"
            onClick={() => navigate(routes.dj.dashboard)}
          />
          <SettingsRow
            label="Sign out"
            showChevron={false}
            onClick={() => {
              void signOut().then(() => navigate(routes.welcome))
            }}
          />
        </SettingsGroup>

        {isDemoMode() && (
          <SettingsGroup
            title="Demo mode"
            footer="Puts the sample party back the way it started."
          >
            <SettingsRow
              label="Reset demo data"
              showChevron={false}
              onClick={() => {
                resetDemoDb()
                toast.success('Demo data reset.')
                navigate(routes.welcome)
              }}
            />
          </SettingsGroup>
        )}

        {/* On its own, in red, at the bottom — the one thing here that cannot
            be undone should not sit in a row of places to go. */}
        {event.status === 'active' && (
          <SettingsGroup>
            <SettingsRow
              label="End event"
              destructive
              showChevron={false}
              onClick={() => setConfirmEnd(true)}
            />
          </SettingsGroup>
        )}

      </main>

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

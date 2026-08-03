import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppButton, AppInput } from '../../components'
import { AuthLayout } from '../../layouts/AuthLayout'
import { routes } from '../../lib/router'
import {
  getActiveService,
  isRemoteCode,
  joinParty,
} from '../../services/partySession'
import { PeerError } from '../../services/peer/signalling'
import { isDemoMode } from '../../lib/env'
import { validateEventCode } from '../../utils/validation'
import { normalizeEventCode } from '../../data/eventCodeGenerator'
import { DEMO_EVENT_CODE } from '../../services/demo/seed'
import { EVENT_CODE_LENGTH } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'
import { readCodeFromSearch } from '../../utils/joinLink'

/**
 * Step one of joining: find the event by its code. The display name is asked
 * for separately so a wrong code fails before the guest types anything else.
 */
export function JoinEventPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // A guest arriving from the DJ's QR code already has the code; typing it
  // again would defeat the point of scanning.
  const prefilled = readCodeFromSearch(location.search)
  const [code, setCode] = useState(prefilled ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const validationError = validateEventCode(code)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      /**
       * A code that isn't the sandbox's is somebody's actual party, so try to
       * reach them before deciding it does not exist. This is what makes a
       * scanned QR code work on a phone that has never seen this app: the
       * connection is established here, and every screen afterwards is talking
       * to the DJ without knowing it.
       */
      if (isRemoteCode(code)) {
        try {
          await joinParty(code)
        } catch (err) {
          setError(
            err instanceof PeerError
              ? err.message
              : 'Could not reach that party.',
          )
          return
        }
      }

      // Resolved after the join, not before: joining replaces the backend, and
      // the one captured when this screen rendered is this device's own.
      const backend = getActiveService()

      const event = await backend.getEventByCode(code)
      if (!event) {
        /**
         * Reaching this without a backend means the code was the sandbox's
         * own, so no connection was attempted — every other code goes over the
         * network above and fails there with something specific.
         */
        setError(
          isDemoMode()
            ? `The sample event is ${DEMO_EVENT_CODE}. For a real party, use the code the DJ is showing.`
            : 'No event found with that code. Check it and try again.',
        )
        return
      }
      if (event.status === 'ended') {
        setError('That event has already ended.')
        return
      }
      // Carry the verified code forward rather than re-looking it up.
      navigate(routes.guest.displayName, {
        state: { code: event.code, eventName: event.name },
      })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Join the party"
      subtitle="Enter the code the DJ is showing."
      footer={
        <AppButton
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => navigate(routes.welcome)}
        >
          Back
        </AppButton>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AppInput
          label="Event code"
          value={code}
          onChange={(e) => {
            setCode(normalizeEventCode(e.target.value))
            setError(null)
          }}
          error={error ?? undefined}
          maxLength={EVENT_CODE_LENGTH}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          autoFocus
          placeholder="ABCD"
          className="text-center text-3xl font-bold tracking-[0.4em] uppercase"
        />

        <AppButton
          type="submit"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={code.length !== EVENT_CODE_LENGTH}
        >
          Continue
        </AppButton>
      </form>
    </AuthLayout>
  )
}

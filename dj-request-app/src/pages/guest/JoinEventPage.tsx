import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppButton, AppInput, DemoNotice } from '../../components'
import { AuthLayout } from '../../layouts/AuthLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
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
  const service = useService()
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
      const event = await service.getEventByCode(code)
      if (!event) {
        /**
         * In demo mode the answer is never "check the code". This browser
         * holds its own private copy of the sample data, so the only event
         * that can possibly exist here is the seeded one — a code from
         * somebody else's phone will never be found, however carefully it is
         * retyped. Saying so beats sending a guest round the loop again.
         */
        setError(
          isDemoMode()
            ? `This is the demo, so only the sample event (${DEMO_EVENT_CODE}) exists on this device. A code from someone else's phone cannot work until the app is connected to a server.`
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
        <DemoNotice>
          Only the sample event ({DEMO_EVENT_CODE}) exists on this phone. A code
          from someone else's device will not be found.
        </DemoNotice>

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

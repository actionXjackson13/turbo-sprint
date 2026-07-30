import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppButton, AppInput } from '../../components'
import { AuthLayout } from '../../layouts/AuthLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { validateEventCode } from '../../utils/validation'
import { normalizeEventCode } from '../../data/eventCodeGenerator'
import { EVENT_CODE_LENGTH } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'

/**
 * Step one of joining: find the event by its code. The display name is asked
 * for separately so a wrong code fails before the guest types anything else.
 */
export function JoinEventPage() {
  const navigate = useNavigate()
  const service = useService()

  const [code, setCode] = useState('')
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
        setError('No event found with that code. Check it and try again.')
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

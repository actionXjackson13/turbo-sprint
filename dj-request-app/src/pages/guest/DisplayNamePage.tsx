import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppButton, AppInput } from '../../components'
import { AuthLayout } from '../../layouts/AuthLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { validateDisplayName } from '../../utils/validation'
import { FIELD_LIMITS } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'
import {
  getRememberedDisplayName,
  setLastEventId,
  setRememberedDisplayName,
} from '../../utils/guestId'

interface JoinState {
  code?: string
  eventName?: string
}

/** Step two of joining: pick the name the DJ will see on your requests. */
export function DisplayNamePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const service = useService()

  const state = (location.state ?? {}) as JoinState
  const [name, setName] = useState(() => getRememberedDisplayName() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reached directly (e.g. refresh on this URL) — send them back to the code.
  if (!state.code) {
    return <Navigate to={routes.guest.join} replace />
  }
  const code = state.code

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const validationError = validateDisplayName(name)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { event } = await service.joinEvent(code, name.trim())
      setLastEventId(event.id)
      setRememberedDisplayName(name.trim())
      navigate(routes.guest.home(event.id), { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="What should we call you?"
      subtitle={
        state.eventName
          ? `Joining ${state.eventName}`
          : 'This name shows on your requests.'
      }
      footer={
        <AppButton
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => navigate(routes.guest.join)}
        >
          Back
        </AppButton>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AppInput
          label="Display name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          error={error ?? undefined}
          maxLength={FIELD_LIMITS.displayName}
          autoComplete="nickname"
          autoFocus
          placeholder="Alex"
        />

        <AppButton type="submit" size="lg" fullWidth loading={submitting}>
          Join event
        </AppButton>
      </form>
    </AuthLayout>
  )
}

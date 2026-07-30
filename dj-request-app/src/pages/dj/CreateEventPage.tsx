import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppButton, AppCard, AppInput, PageHeader } from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { validateEventName } from '../../utils/validation'
import { FIELD_LIMITS } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'

export function CreateEventPage() {
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const validationError = validateEventName(name)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      const event = await service.createEvent(name)
      toast.success(`Event created — code ${event.code}`)
      navigate(routes.dj.event(event.id), { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RootLayout>
      <PageHeader title="New event" showBack />

      <main className="flex-1 px-4 py-4">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <AppInput
            label="Event name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            error={error ?? undefined}
            hint="Guests see this when they join."
            maxLength={FIELD_LIMITS.eventName}
            autoFocus
            placeholder="Summer Rooftop Party"
          />

          <AppButton type="submit" size="lg" fullWidth loading={submitting}>
            Create event
          </AppButton>

          <AppCard>
            <p className="text-sm text-fg-muted">
              We'll generate a short code for you to share. Requests open
              automatically — you can pause or close them any time.
            </p>
          </AppCard>
        </form>
      </main>
    </RootLayout>
  )
}

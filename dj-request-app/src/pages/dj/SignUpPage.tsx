import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AppButton, AppInput } from '../../components'
import { AuthLayout } from '../../layouts/AuthLayout'
import { routes } from '../../lib/router'
import { useDjAuth } from '../../hooks/useDjAuth'
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '../../utils/validation'
import { FIELD_LIMITS } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'

export function SignUpPage() {
  const navigate = useNavigate()
  const { profile, loading, signUp } = useDjAuth()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{
    displayName?: string
    email?: string
    password?: string
    form?: string
  }>({})
  const [submitting, setSubmitting] = useState(false)

  if (!loading && profile) {
    return <Navigate to={routes.dj.dashboard} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const nextErrors = {
      displayName: validateDisplayName(displayName) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
    }
    setErrors(nextErrors)
    if (nextErrors.displayName || nextErrors.email || nextErrors.password) return

    setSubmitting(true)
    try {
      await signUp(email, password, displayName)
      navigate(routes.dj.dashboard, { replace: true })
    } catch (err) {
      setErrors({ form: getErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create a DJ account"
      subtitle="Guests join with a code — only you need an account."
      footer={
        <p className="text-center text-sm text-fg-muted">
          Already have one?{' '}
          <Link
            to={routes.dj.signIn}
            className="font-semibold text-brand-400 hover:text-brand-500"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AppInput
          label="DJ name"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value)
            setErrors((p) => ({ ...p, displayName: undefined, form: undefined }))
          }}
          error={errors.displayName}
          hint="Guests see this on the event screen."
          maxLength={FIELD_LIMITS.displayName}
          autoComplete="nickname"
          placeholder="DJ Nova"
        />
        <AppInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrors((p) => ({ ...p, email: undefined, form: undefined }))
          }}
          error={errors.email}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="you@example.com"
        />
        <AppInput
          label="Password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErrors((p) => ({ ...p, password: undefined, form: undefined }))
          }}
          error={errors.password}
          hint="At least 6 characters."
          autoComplete="new-password"
        />

        {errors.form && (
          <p role="alert" className="text-sm text-danger-500">
            {errors.form}
          </p>
        )}

        <AppButton type="submit" size="lg" fullWidth loading={submitting}>
          Create account
        </AppButton>
      </form>
    </AuthLayout>
  )
}

import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AppButton, AppInput } from '../../components'
import { AuthLayout } from '../../layouts/AuthLayout'
import { routes } from '../../lib/router'
import { useDjAuth } from '../../hooks/useDjAuth'
import { validateEmail, validatePassword } from '../../utils/validation'
import { getErrorMessage } from '../../utils/errors'
import { isDemoMode, showDemoShortcuts } from '../../lib/env'
import { DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD } from '../../services/demo/seed'
import { listDemoDjAccounts } from '../../services/demo/demoAuth'

export function SignInPage() {
  const navigate = useNavigate()
  const { profile, loading, signIn, signInAsDemoProfile } = useDjAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{
    email?: string
    password?: string
    form?: string
  }>({})
  const [submitting, setSubmitting] = useState(false)

  /**
   * Read once. The list cannot change while this screen is open — nothing here
   * creates an account — and re-reading it on every keystroke would be work
   * for nothing.
   */
  const demoAccounts = useMemo(
    () => (isDemoMode() ? listDemoDjAccounts() : []),
    [],
  )

  const continueAs = async (profileId: string) => {
    setSubmitting(true)
    try {
      await signInAsDemoProfile(profileId)
      navigate(routes.dj.dashboard, { replace: true })
    } catch (err) {
      setErrors({ form: getErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  if (!loading && profile) {
    return <Navigate to={routes.dj.dashboard} replace />
  }

  const submit = async (withEmail: string, withPassword: string) => {
    const nextErrors = {
      email: validateEmail(withEmail) ?? undefined,
      password: validatePassword(withPassword) ?? undefined,
    }
    setErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return

    setSubmitting(true)
    try {
      await signIn(withEmail, withPassword)
      navigate(routes.dj.dashboard, { replace: true })
    } catch (err) {
      setErrors({ form: getErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(email, password)
  }

  return (
    <AuthLayout
      title="DJ sign in"
      subtitle="Manage your events and requests."
      footer={
        <p className="text-center text-sm text-fg-muted">
          No account?{' '}
          <Link
            to={routes.dj.signUp}
            className="font-semibold text-brand-400 hover:text-brand-500"
          >
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
          autoComplete="current-password"
        />

        {errors.form && (
          <p role="alert" className="text-sm text-danger-500">
            {errors.form}
          </p>
        )}

        <AppButton type="submit" size="lg" fullWidth loading={submitting}>
          Sign in
        </AppButton>

        {showDemoShortcuts() && (
          <div className="space-y-3 rounded-control border border-dashed border-hairline-strong p-3">
            <p className="text-center text-label text-fg-subtle uppercase">
              On this phone
            </p>

            {/*
              The way back in. Demo accounts live in this browser and nowhere
              else — there is no password to check and no reset to send — so an
              email remembered slightly wrong would otherwise lock a DJ out of
              their own events for good.
            */}
            <ul className="space-y-2">
              {demoAccounts.map(({ profile: account, email }) => (
                <li key={account.id}>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void continueAs(account.id)}
                    className={
                      'flex min-h-12 w-full items-center gap-3 rounded-control ' +
                      'border border-hairline bg-ink-900 px-3 py-2 text-left ' +
                      'transition-colors active:bg-ink-800 disabled:opacity-50'
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">
                        {account.displayName}
                      </span>
                      <span className="block truncate text-meta text-fg-muted">
                        {email ?? 'Made before sign-in remembered emails'}
                      </span>
                    </span>
                    <span className="shrink-0 text-meta text-brand-400">
                      Continue
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <AppButton
              variant="ghost"
              fullWidth
              size="sm"
              loading={submitting}
              onClick={() => {
                setEmail(DEMO_DJ_EMAIL)
                setPassword(DEMO_DJ_PASSWORD)
                void submit(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
              }}
            >
              Use the sample DJ account
            </AppButton>
          </div>
        )}

      </form>
    </AuthLayout>
  )
}

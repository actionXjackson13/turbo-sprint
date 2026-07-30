import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppButton } from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { showDemoShortcuts } from '../../lib/env'
import { getLastEventId } from '../../utils/guestId'
import { useService } from '../../hooks/useService'
import { DEMO_EVENT_CODE } from '../../services/demo/seed'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'

export function WelcomePage() {
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()
  const [resuming, setResuming] = useState<string | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)

  // Offer to jump straight back into the last event this device joined.
  useEffect(() => {
    const lastEventId = getLastEventId()
    if (!lastEventId) return

    let cancelled = false
    void (async () => {
      const event = await service.getEventById(lastEventId)
      const guest = await service.getGuestSession(lastEventId)
      if (cancelled) return
      if (event && event.status === 'active' && guest) {
        setResuming(lastEventId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [service])

  const enterDemoAsGuest = async () => {
    setDemoBusy(true)
    try {
      const event = await service.joinEvent(DEMO_EVENT_CODE, 'You')
      navigate(routes.guest.home(event.event.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <RootLayout>
      <div className="flex flex-1 flex-col justify-between px-6 pt-safe">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-accent-500">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-10 text-white"
              aria-hidden="true"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>

          <h1 className="text-4xl leading-tight font-bold text-fg">
            SoundBoard
          </h1>
          <p className="mt-3 max-w-xs text-base text-fg-muted">
            Request songs from the DJ and vote on what plays next.
          </p>
        </div>

        <div className="space-y-3 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {resuming && (
            <AppButton
              size="lg"
              fullWidth
              onClick={() => navigate(routes.guest.home(resuming))}
            >
              Back to your event
            </AppButton>
          )}

          <AppButton
            variant={resuming ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            onClick={() => navigate(routes.guest.join)}
          >
            Join an event
          </AppButton>

          <Link
            to={routes.dj.signIn}
            className="flex min-h-12 items-center justify-center text-base font-medium text-fg-muted hover:text-fg"
          >
            I'm the DJ
          </Link>

          {showDemoShortcuts() && (
            <div className="mt-2 rounded-2xl border border-dashed border-ink-600 p-3">
              <p className="mb-2 text-center text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                Demo mode — no account needed
              </p>
              <div className="flex gap-2">
                <AppButton
                  variant="secondary"
                  size="sm"
                  fullWidth
                  loading={demoBusy}
                  onClick={enterDemoAsGuest}
                >
                  Enter as guest
                </AppButton>
                <AppButton
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => navigate(routes.dj.signIn)}
                >
                  Enter as DJ
                </AppButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </RootLayout>
  )
}

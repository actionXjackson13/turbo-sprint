import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppButton, PageHeader, QrCode } from '../../components'
import { RootLayout } from '../../layouts/RootLayout'
import { routes } from '../../lib/router'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useToast } from '../../hooks/useToast'
import { useWakeLock } from '../../hooks/useWakeLock'
import { copyToClipboard } from '../../utils/clipboard'
import { buildJoinUrl } from '../../utils/joinLink'
import { haptic } from '../../utils/haptics'
import { DjEventProvider } from '../../contexts/DjEventProvider'

/**
 * "Show this to the room."
 *
 * Getting guests in is the highest-drop-off moment at a real event: reading a
 * code off a phone across a dark room, then typing it correctly, is a lot to
 * ask of someone holding a drink. This screen is meant to be held up or put on
 * a venue display — an oversized code for anyone close enough to read, a QR
 * for everyone else, and a share sheet for the group chat.
 *
 * It deliberately sits outside the DJ tab bar: the navigation is noise when the
 * screen's whole job is to be looked at from three metres away.
 */
function ShareEventContent() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { event, guestCount } = useDjEvent()

  const [copied, setCopied] = useState(false)

  // Held up in front of a room, this screen must not sleep.
  useWakeLock(true)

  if (!event) return null

  const joinUrl = buildJoinUrl(event.code)

  const copyLink = async () => {
    haptic('tap')
    const ok = await copyToClipboard(joinUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Join link copied.')
    } else {
      toast.error('Could not copy the link.')
    }
  }

  const share = async () => {
    haptic('tap')
    // The native sheet is the fastest route into a group chat, which is how
    // most guests will actually receive this.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: event.name,
          text: `Request a song at ${event.name} — code ${event.code}`,
          url: joinUrl,
        })
        return
      } catch {
        // Dismissed, or sharing refused; fall through to copying.
      }
    }
    await copyLink()
  }

  return (
    <RootLayout>
      <PageHeader
        title="Invite the room"
        showBack
        onBack={() => navigate(routes.dj.event(eventId))}
      />

      <main className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-6">
        <div className="text-center">
          <p className="text-label text-fg-subtle uppercase">Join code</p>
          {/* Sized to be readable across a room, not to fit a layout. */}
          <p className="mt-2 font-mono text-6xl leading-none font-bold tracking-[0.18em] text-brand-400">
            {event.code}
          </p>
        </div>

        <div className="w-full max-w-[15rem]">
          <QrCode
            value={joinUrl}
            label={`Scan to join ${event.name}. Or enter code ${event.code}.`}
          />
        </div>

        <p className="max-w-xs text-center text-sm text-fg-muted">
          Scan the code, or open the app and enter{' '}
          <span className="font-semibold text-fg">{event.code}</span>.
        </p>

        <div className="w-full space-y-2">
          <AppButton size="lg" fullWidth onClick={share}>
            Share join link
          </AppButton>
          <AppButton
            variant="secondary"
            size="lg"
            fullWidth
            onClick={copyLink}
          >
            {copied ? 'Copied' : 'Copy link'}
          </AppButton>
        </div>

        <p className="text-meta text-fg-subtle">
          {guestCount} {guestCount === 1 ? 'guest has' : 'guests have'} joined
        </p>
      </main>
    </RootLayout>
  )
}

/** Supplies the event context, since this screen sits outside the DJ layout. */
export function ShareEventPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  return (
    <DjEventProvider eventId={eventId}>
      <ShareEventContent />
    </DjEventProvider>
  )
}

import { useState } from 'react'
import { AppButton, AppCard } from '../../components'
import {
  handOffToAppleMusic,
  isHandoffEnabled,
  setHandoffEnabled,
} from '../../features/appleMusic/handoff'

/**
 * Whether starting a song should also open it in Apple Music.
 *
 * There used to be a Shortcut here, with written-out steps for building it.
 * The steps could not be followed: Apple's Shortcuts app has no action that
 * searches the Apple Music catalogue, so there was nothing to hand a song to.
 * Rather than leave instructions that dead-end, this is now the thing that
 * actually works — a link, no setup — and it says plainly what it does, since
 * "hand-off" previously implied an automatic queueing it never achieved.
 */
export function AppleMusicSetup() {
  const [enabled, setEnabled] = useState(isHandoffEnabled)

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setHandoffEnabled(next)
  }

  return (
    <AppCard>
      <p className="text-sm text-fg-muted">
        Starting a song can also open it in Apple Music, so you can play it on
        your own subscription instead of in the app. You still tap play there —
        Apple gives no way to queue a song automatically without a paid add-on.
      </p>

      <AppButton
        variant={enabled ? 'success' : 'primary'}
        size="lg"
        fullWidth
        className="mt-3"
        onClick={toggle}
      >
        {enabled ? 'Opening songs in Apple Music' : 'Open songs in Apple Music'}
      </AppButton>

      {enabled && (
        <>
          <AppButton
            variant="secondary"
            fullWidth
            className="mt-2"
            onClick={() =>
              // A song everyone can recognise, so a wrong result is obvious.
              handOffToAppleMusic({ title: 'Dancing Queen', artist: 'ABBA' })
            }
          >
            Test it with one song
          </AppButton>
          <p className="mt-2 text-meta text-fg-subtle">
            Apple Music should open with Dancing Queen searched for.
          </p>
        </>
      )}
    </AppCard>
  )
}

import { useState } from 'react'
import { AppButton, AppCard, AppInput } from '../../components'
import {
  DEFAULT_SHORTCUT_NAME,
  getShortcutName,
  handOffToAppleMusic,
  isHandoffEnabled,
  setHandoffEnabled,
  setShortcutName,
  supportsShortcuts,
} from '../../features/appleMusic/handoff'

/**
 * Turning on the Apple Music hand-off, and proving it works.
 *
 * The setup is three taps in another app, which is exactly the kind of thing
 * that gets abandoned halfway — so the steps are written out here rather than
 * linked to, and there is a Test button. Finding out it works *now* is worth a
 * great deal more than finding out mid-party that it does not.
 */
export function AppleMusicSetup() {
  const [enabled, setEnabled] = useState(isHandoffEnabled)
  const [name, setName] = useState(getShortcutName)

  // Shortcuts is an Apple feature; a switch that could never work is worse
  // than no switch.
  if (!supportsShortcuts()) {
    return (
      <AppCard>
        <p className="text-sm text-fg-muted">
          Sending songs to Apple Music needs the Shortcuts app, so it only works
          from an iPhone or iPad. Open this event there to set it up.
        </p>
      </AppCard>
    )
  }

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setHandoffEnabled(next)
  }

  const saveName = (value: string) => {
    setName(value)
    setShortcutName(value)
  }

  return (
    <AppCard>
      <AppButton
        variant={enabled ? 'success' : 'primary'}
        size="lg"
        fullWidth
        onClick={toggle}
      >
        {enabled ? 'Apple Music hand-off is on' : 'Turn on Apple Music hand-off'}
      </AppButton>

      {enabled && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-label uppercase text-fg-subtle">
              Set up the Shortcut, once
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                Open the <span className="text-fg">Shortcuts</span> app and tap{' '}
                <span className="text-fg">+</span>.
              </li>
              <li>
                Add the action <span className="text-fg">Search Apple Music</span>{' '}
                and set it to take <span className="text-fg">Shortcut Input</span>.
              </li>
              <li>
                Add <span className="text-fg">Add to Up Next</span> underneath
                it, and point it at the search result.
              </li>
              <li>
                Name it <span className="text-fg">{DEFAULT_SHORTCUT_NAME}</span>{' '}
                — or anything, as long as it matches the box below.
              </li>
            </ol>
          </div>

          <AppInput
            label="Shortcut name"
            value={name}
            onChange={(e) => saveName(e.target.value)}
            placeholder={DEFAULT_SHORTCUT_NAME}
            autoCapitalize="words"
            autoCorrect="off"
          />

          <AppButton
            variant="secondary"
            fullWidth
            onClick={() =>
              // A song everyone can recognise, so a wrong result is obvious.
              handOffToAppleMusic({ title: 'Dancing Queen', artist: 'ABBA' })
            }
          >
            Test it with one song
          </AppButton>

          <p className="text-meta text-fg-subtle">
            The test should put Dancing Queen next in Apple Music. If nothing
            happens, the name above does not match the Shortcut.
          </p>
        </div>
      )}
    </AppCard>
  )
}

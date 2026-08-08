import { useState } from 'react'
import { AppButton, AppCard, AppInput } from '../../components'
import { useToast } from '../../hooks/useToast'
import {
  getYouTubeKey,
  setYouTubeKey,
} from '../../services/player/playerSettings'
import { clearVideoCache } from '../../services/player/videoCache'

/**
 * Setting up in-app playback.
 *
 * One field, because there is only one thing the app cannot supply itself. The
 * player is free and unmetered; only turning a song title into a video needs a
 * key, and it has to be the DJ's own — a key baked into the bundle would be
 * readable by anyone loading the page and its daily lookups shared by every
 * party at once.
 *
 * The steps are written out rather than linked, for the same reason the old
 * Shortcut steps were: a setup that sends someone to another site to work it
 * out is a setup that gets abandoned halfway.
 */
export function PlayerSetup() {
  const toast = useToast()
  const [key, setKey] = useState(getYouTubeKey)
  const [saved, setSaved] = useState(true)

  const save = () => {
    setYouTubeKey(key)
    setSaved(true)
    toast.success(key.trim() ? 'YouTube key saved.' : 'YouTube key removed.')
  }

  return (
    <AppCard>
      <p className="text-sm text-fg-muted">
        The app can play the queue itself, through YouTube. Playing is free and
        unlimited; only looking up each song needs a key, and one key covers
        about a hundred new songs a day. Songs already looked up are remembered
        for good and never cost again.
      </p>

      <div className="mt-4">
        <p className="text-label uppercase text-fg-subtle">
          Get a free key, once
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-fg-muted">
          <li>
            Open <span className="text-fg">console.cloud.google.com</span> and
            sign in. No card is needed.
          </li>
          <li>
            Make a project — the name does not matter.
          </li>
          <li>
            Search for <span className="text-fg">YouTube Data API v3</span> and
            press <span className="text-fg">Enable</span>.
          </li>
          <li>
            Go to <span className="text-fg">Credentials</span> →{' '}
            <span className="text-fg">Create credentials</span> →{' '}
            <span className="text-fg">API key</span>, and copy it.
          </li>
        </ol>
      </div>

      <div className="mt-4 space-y-2">
        <AppInput
          label="YouTube key"
          value={key}
          onChange={(e) => {
            setKey(e.target.value)
            setSaved(false)
          }}
          placeholder="AIza…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <AppButton fullWidth disabled={saved} onClick={save}>
          Save key
        </AppButton>
      </div>

      {/*
        The escape hatch for a cache that has learned a wrong answer. Rare, but
        without it a song that once resolved badly would keep resolving badly
        for as long as the device remembered it.
      */}
      <AppButton
        variant="ghost"
        fullWidth
        className="mt-2"
        onClick={() => {
          clearVideoCache()
          toast.success('Remembered songs cleared.')
        }}
      >
        Forget remembered songs
      </AppButton>
    </AppCard>
  )
}

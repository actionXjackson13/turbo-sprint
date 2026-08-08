import { useState, type ReactNode } from 'react'
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
/**
 * A step that is also the way to do it.
 *
 * Opened in a new tab deliberately: the DJ is coming back here to paste the
 * key, and navigating this tab away from a running event would cost them the
 * page they are half-way through.
 */
function SetupLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-brand-400 underline underline-offset-2"
    >
      {children}
    </a>
  )
}

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
        {/*
          Links straight to the two pages, rather than the console's front door.
          Google's own top-of-page search looks like the obvious way in and is
          not — it searches the console's settings and docs, so "YouTube Data"
          returns everything except the thing you came to switch on.
        */}
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-fg-muted">
          <li>
            <SetupLink href="https://console.cloud.google.com/projectcreate">
              Make a project
            </SetupLink>{' '}
            — any name, no card needed.
          </li>
          <li>
            <SetupLink href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">
              Turn on the YouTube Data API
            </SetupLink>{' '}
            — check your new project is picked at the top, then press{' '}
            <span className="text-fg">Enable</span>.
          </li>
          <li>
            <SetupLink href="https://console.cloud.google.com/apis/credentials">
              Create the key
            </SetupLink>{' '}
            — <span className="text-fg">+ Create credentials</span> →{' '}
            <span className="text-fg">API key</span>. Copy it into the box below.
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

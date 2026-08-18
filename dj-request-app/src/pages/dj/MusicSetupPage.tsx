import { useNavigate, useParams } from 'react-router-dom'
import { AppButton, AppCard, PageHeader, Section, Toggle } from '../../components'
import { routes } from '../../lib/router'
import { PlayerSetup } from './PlayerSetup'
import { AppleMusicSetup } from './AppleMusicSetup'
import { usePlaybackMode } from '../../hooks/usePlaybackMode'
import { setPlaybackMode } from '../../services/player/playbackMode'

/**
 * Everything about where the music comes from, in one place.
 *
 * These used to sit inline on Event settings, and between them ran to most of a
 * screen — a numbered set-up list and a key field, above a second card about
 * Apple Music — pushing the things a DJ actually touches mid-party (message the
 * room, block a guest, end the event) well below the fold.
 *
 * They belong together and they belong out of the way: they all answer the same
 * question, and they are set once and then never again.
 *
 * The first question is the one that decides whether the rest of the screen is
 * even relevant, so it is asked first: is the app playing this, or are you?
 */
export function MusicSetupPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const mode = usePlaybackMode()
  const ownDecks = mode === 'my-own-decks'

  return (
    <>
      <PageHeader title="Music" subtitle="Where songs play from. Set once." />

      <main className="flex-1 space-y-7 px-4 py-5">
        <Section title="Who plays the music">
          <AppCard>
            <Toggle
              checked={ownDecks}
              onChange={(next) =>
                setPlaybackMode(next ? 'my-own-decks' : 'in-app')
              }
              label="I run my own decks"
              description="You play the music on your own setup. The app takes requests and tells the room what’s on."
            />

            <p className="mt-3 text-sm text-fg-muted">
              {ownDecks
                ? 'The app’s player is off. On the Queue screen you say what’s playing — search a song or type it — and every guest’s phone follows.'
                : 'The app plays the queue itself through YouTube. Turn this on if you DJ from rekordbox, SoundCloud, or anything else.'}
            </p>
          </AppCard>
        </Section>

        {/*
          Only shown when it can do something. A key field and three console
          links are noise to someone who is never going to let the app play a
          note — and worse, they read as required setup for an app that is
          already working fine for them.
        */}
        {!ownDecks && (
          <Section title="Play in the app">
            <PlayerSetup />
          </Section>
        )}

        <Section title="Apple Music">
          <AppleMusicSetup />
        </Section>

        <AppButton
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => navigate(routes.dj.settings(eventId))}
        >
          Back to settings
        </AppButton>
      </main>
    </>
  )
}

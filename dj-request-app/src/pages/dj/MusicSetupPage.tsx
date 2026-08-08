import { useNavigate, useParams } from 'react-router-dom'
import { AppButton, PageHeader, Section } from '../../components'
import { routes } from '../../lib/router'
import { PlayerSetup } from './PlayerSetup'
import { AppleMusicSetup } from './AppleMusicSetup'

/**
 * Everything about where the music comes from, in one place.
 *
 * These two used to sit inline on Event settings, and between them ran to most
 * of a screen — a numbered set-up list and a key field, above a second card
 * about Apple Music — pushing the things a DJ actually touches mid-party
 * (message the room, block a guest, end the event) well below the fold.
 *
 * They belong together and they belong out of the way: both answer the same
 * question, and both are set once and then never again.
 */
export function MusicSetupPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader
        title="Music"
        subtitle="Where songs play from. Set once."
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        <Section title="Play in the app">
          <PlayerSetup />
        </Section>

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

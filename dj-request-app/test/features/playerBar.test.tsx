import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PlayerBar } from '../../src/features/player/PlayerBar'
import { PartyPlayerContext } from '../../src/contexts/partyPlayerContext'
import type { PartyPlayerState } from '../../src/features/player/usePartyPlayer'
import type { SongRequest } from '../../src/types/domain'

/**
 * What the transport says when playback stops.
 *
 * The reason a song will not play used to be rendered on the Queue tab and
 * nowhere else, so pressing play from any other screen gave a bar that appeared
 * and then sat there — a missing key, a spent daily quota and a video YouTube
 * refuses to embed all looked identical, and all looked like the app being
 * broken. The bar follows the DJ around; so must the explanation.
 */

const song: SongRequest = {
  id: 'r1',
  eventId: 'e1',
  guestId: null,
  guestDisplayName: 'DJ',
  title: 'Man I Need',
  artist: 'Olivia Dean',
  voteCount: 0,
  status: 'played',
  queuePosition: null,
  queueGroup: 'main',
  sourceRoundId: null,
  catalogId: null,
  artworkUrl: null,
  catalogUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function renderBar(overrides: Partial<PartyPlayerState>) {
  const value = {
    hostRef: { current: null },
    status: 'idle',
    current: null,
    match: null,
    queue: [],
    loading: false,
    failure: null,
    start: () => {},
    skip: () => {},
    togglePause: () => {},
    wrongSong: () => {},
    ...overrides,
  } as PartyPlayerState

  return render(
    <MemoryRouter>
      <PartyPlayerContext.Provider value={value}>
        <PlayerBar eventId="e1" />
      </PartyPlayerContext.Provider>
    </MemoryRouter>,
  )
}

describe('the player bar', () => {
  it('shows the song while it is playing', () => {
    renderBar({ status: 'playing', current: song })

    expect(screen.getByText('Man I Need')).toBeInTheDocument()
    expect(screen.getByText('Olivia Dean')).toBeInTheDocument()
  })

  it('says it is still looking while it resolves', () => {
    renderBar({ status: 'resolving', current: song })
    expect(screen.getByText('Finding it…')).toBeInTheDocument()
  })

  /** The bug: a halted player that explained nothing. */
  it('says why it stopped, wherever the DJ is standing', () => {
    renderBar({
      status: 'error',
      current: song,
      failure:
        'Add a free YouTube key in Event settings to let the app play songs.',
    })

    expect(screen.getByText('Can’t play this')).toBeInTheDocument()
    expect(
      screen.getByText(/add a free youtube key in event settings/i),
    ).toBeInTheDocument()
  })

  it('does not offer to pause something that is not playing', () => {
    renderBar({ status: 'error', current: song, failure: 'Quota spent.' })
    expect(screen.getByLabelText(/pause/i)).toBeDisabled()
  })

  /** Skipping past a dead song is the one useful thing left to do. */
  it('still lets the DJ move on', () => {
    renderBar({ status: 'error', current: song, failure: 'Quota spent.' })
    expect(screen.getByLabelText(/skip/i)).toBeEnabled()
  })

  it('stays out of the way when nothing is on', () => {
    const { container } = renderBar({ status: 'idle' })
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})

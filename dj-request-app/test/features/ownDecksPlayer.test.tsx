import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A DJ on their own decks gets no player at all.
 *
 * Not a player told to stay quiet — nothing mounted. The distinction is the
 * whole point: `usePartyPlayer` loads the YouTube iframe API, polls for
 * playback position while a song runs, and claims the phone's media session. A
 * hidden-but-running player would put SoundBoard on the lock screen of a phone
 * whose owner is playing their music from rekordbox, and would keep spending
 * YouTube lookups for a feature they turned off.
 *
 * The context itself stays, permanently idle, because every DJ screen reads it
 * unconditionally and idle is a state they all already render — it is what they
 * show before the first song of the night.
 */

const usePartyPlayer = vi.fn((_eventId: string) => ({ status: 'playing' }))
const playerBar = vi.fn()

vi.mock('../../src/features/player/usePartyPlayer', () => ({
  usePartyPlayer: (eventId: string) => usePartyPlayer(eventId),
}))

vi.mock('../../src/features/player/PlayerBar', () => ({
  PlayerBar: (props: { eventId: string }) => {
    playerBar(props)
    return <div data-testid="player-bar" />
  },
  PlayerBarSpacer: () => null,
}))

const { PartyPlayerProvider } = await import(
  '../../src/contexts/PartyPlayerProvider'
)
const { setPlaybackMode, __resetPlaybackMode } = await import(
  '../../src/services/player/playbackMode'
)
const { usePartyPlayerState } = await import(
  '../../src/hooks/usePartyPlayerState'
)

function Probe() {
  const player = usePartyPlayerState()
  return <span data-testid="status">{player.status}</span>
}

beforeEach(() => {
  localStorage.clear()
  __resetPlaybackMode()
  usePartyPlayer.mockClear()
  playerBar.mockClear()
})

afterEach(() => {
  localStorage.clear()
  __resetPlaybackMode()
})

describe('the player, when the DJ runs their own decks', () => {
  it('is mounted as usual by default', () => {
    render(
      <PartyPlayerProvider eventId="e1">
        <Probe />
      </PartyPlayerProvider>,
    )

    expect(usePartyPlayer).toHaveBeenCalledWith('e1')
    expect(screen.getByTestId('player-bar')).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('playing')
  })

  it('never starts once the DJ says they play the music themselves', () => {
    setPlaybackMode('my-own-decks')

    render(
      <PartyPlayerProvider eventId="e1">
        <Probe />
      </PartyPlayerProvider>,
    )

    expect(usePartyPlayer).not.toHaveBeenCalled()
    expect(screen.queryByTestId('player-bar')).not.toBeInTheDocument()
  })

  /** The screens below must still find a player to read, or they throw. */
  it('still gives the screens something to read', () => {
    setPlaybackMode('my-own-decks')

    render(
      <PartyPlayerProvider eventId="e1">
        <Probe />
      </PartyPlayerProvider>,
    )

    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })

  /**
   * The switch is on a different screen from the bar, and the bar lives above
   * the router and never unmounts — so it has to go on the strength of the
   * setting changing, not on a navigation.
   */
  it('goes away the moment the setting changes', () => {
    render(
      <PartyPlayerProvider eventId="e1">
        <Probe />
      </PartyPlayerProvider>,
    )
    expect(screen.getByTestId('player-bar')).toBeInTheDocument()

    // No re-render forced from the outside: flipping the setting has to be
    // enough on its own, because the DJ flips it two screens away from here.
    act(() => setPlaybackMode('my-own-decks'))

    expect(screen.queryByTestId('player-bar')).not.toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })
})

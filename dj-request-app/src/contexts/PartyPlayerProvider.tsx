import { useMemo, useRef, type ReactNode } from 'react'
import { PartyPlayerContext } from './partyPlayerContext'
import {
  usePartyPlayer,
  type PartyPlayerState,
} from '../features/player/usePartyPlayer'
import { PlayerBar } from '../features/player/PlayerBar'
import { usePlaybackMode } from '../hooks/usePlaybackMode'

/**
 * Owns playback for the whole of a DJ's event, above the router outlet.
 *
 * Mounted here rather than on the player screen so that walking over to
 * Requests, or reordering the queue, does not silence the room.
 *
 * A DJ on their own decks gets the silent branch instead — not a player told to
 * stay quiet, but no player at all: nothing loads the YouTube iframe API, polls
 * for playback position, or claims the phone's media keys. That last one is the
 * reason this is a split rather than a flag. A hidden player still holding the
 * media session would put SoundBoard on the lock screen of a phone whose owner
 * is playing music from something else entirely.
 */
export function PartyPlayerProvider({
  eventId,
  children,
}: {
  eventId: string
  children: ReactNode
}) {
  return usePlaybackMode() === 'my-own-decks' ? (
    <SilentPlayer>{children}</SilentPlayer>
  ) : (
    <ActivePlayer eventId={eventId}>{children}</ActivePlayer>
  )
}

function ActivePlayer({
  eventId,
  children,
}: {
  eventId: string
  children: ReactNode
}) {
  const player = usePartyPlayer(eventId)

  return (
    <PartyPlayerContext.Provider value={player}>
      {children}
      <PlayerBar eventId={eventId} />
    </PartyPlayerContext.Provider>
  )
}

/**
 * A player-shaped nothing.
 *
 * The screens below read the player unconditionally — `usePartyPlayerState`
 * throws without a provider — and rewriting each of them to cope with its
 * absence would spread this one decision across every DJ screen. So the context
 * is still there and permanently idle, which every one of those screens already
 * knows how to render: idle is what they show before the first song.
 */
function SilentPlayer({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)

  const idle = useMemo<PartyPlayerState>(
    () => ({
      hostRef,
      status: 'idle',
      current: null,
      match: null,
      queue: [],
      position: 0,
      duration: 0,
      loading: false,
      failure: null,
      start: noop,
      skip: noop,
      togglePause: noop,
      wrongSong: noop,
    }),
    [],
  )

  return (
    <PartyPlayerContext.Provider value={idle}>
      {children}
    </PartyPlayerContext.Provider>
  )
}

function noop() {}

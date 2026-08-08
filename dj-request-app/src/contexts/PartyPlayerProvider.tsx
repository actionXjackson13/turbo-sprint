import type { ReactNode } from 'react'
import { PartyPlayerContext } from './partyPlayerContext'
import { usePartyPlayer } from '../features/player/usePartyPlayer'
import { PlayerBar } from '../features/player/PlayerBar'

/**
 * Owns playback for the whole of a DJ's event, above the router outlet.
 *
 * Mounted here rather than on the player screen so that walking over to
 * Requests, or reordering the queue, does not silence the room.
 */
export function PartyPlayerProvider({
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

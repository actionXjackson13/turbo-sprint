import { useEffect } from 'react'
import { startHosting } from '../services/partySession'

/**
 * Keeps this device hosting its event while the DJ is looking at it.
 *
 * Opening the party is not a decision worth asking about: a DJ who has created
 * an event and is looking at its join code wants guests to be able to use that
 * code, and any switch for it would be a switch everyone has to find before
 * the app works. So it happens on mount, and PartyStatus reports whether it
 * took.
 *
 * Deliberately not torn down on unmount — the DJ moves between the control
 * panel, the queue and the invite screen all night, and dropping every
 * connected guest each time would be absurd. `stopHosting` is for ending the
 * event.
 */
export function useHostParty(eventId: string, code: string | undefined): void {
  useEffect(() => {
    if (!eventId || !code) return
    void startHosting(eventId, code).catch(() => {
      // Reported through party state, which PartyStatus renders.
    })
  }, [eventId, code])
}

import { useEffect } from 'react'
import { startHosting } from '../services/partySession'
import { useParty } from './useParty'
import { useWakeLock } from './useWakeLock'

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
  const hosting = useParty().mode === 'hosting'

  /**
   * Keep the screen on for as long as this phone is the party.
   *
   * Not a comfort feature here. A locked phone suspends the page, and a
   * suspended page stops answering its guests: their screens go blank, every
   * call sits there until it times out, and the connection eventually gives
   * up. From a guest's side that is indistinguishable from the app being
   * broken, which is exactly how it was reported. The DJ's screen staying lit
   * is what a serverless party costs.
   */
  useWakeLock(hosting)

  useEffect(() => {
    if (!eventId || !code) return
    void startHosting(eventId, code).catch(() => {
      // Reported through party state, which PartyStatus renders.
    })
  }, [eventId, code])
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPartySession,
  getActiveService,
  getPartyState,
  startGuestPreview,
  stopGuestPreview,
} from '../../src/services/partySession'
import { getDataService } from '../../src/services/index'

/**
 * The DJ standing in their own queue.
 *
 * The point is that it is not a rehearsal: the app swaps which backend every
 * screen reads through, so the guest request form is the guest request form and
 * what it posts is a real request. What has to hold is the way back — a DJ who
 * cannot return to their own control panel mid-party has been locked out of the
 * thing they are running.
 *
 * These run in demo mode (the suite pins it), which is the branch that needs no
 * second Supabase session. The Supabase branch differs only in which service
 * object is installed; everything asserted here is the switching itself.
 */

beforeEach(() => {
  __resetPartySession()
})

afterEach(() => {
  __resetPartySession()
  vi.restoreAllMocks()
})

describe('looking at your own party as a guest', () => {
  it('starts with nobody previewing', () => {
    expect(getPartyState().previewingEventId).toBeNull()
  })

  it('records which event is being looked at', async () => {
    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    expect(getPartyState().previewingEventId).toBe('event-1')
  })

  it('lets go again', async () => {
    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    stopGuestPreview()
    expect(getPartyState().previewingEventId).toBeNull()
  })

  /**
   * The bug that shipped: making the preview the app-wide backend pointed the
   * "is a DJ signed in" check at an anonymous guest session, so the app decided
   * the DJ had signed out and bounced them to the sign-in screen. The preview
   * belongs to the guest screens; the rest of the app must not see it.
   */
  it('never becomes the app’s own backend', async () => {
    const own = getActiveService()

    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    expect(getActiveService()).toBe(own)

    stopGuestPreview()
    expect(getActiveService()).toBe(own)
  })

  it('offers the guest session only to whoever asks for it', async () => {
    const { getPreviewService } = await import(
      '../../src/services/partySession'
    )
    expect(getPreviewService()).toBeNull()

    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    // Demo mode installs no second service — its database is already local.
    expect(getPartyState().previewingEventId).toBe('event-1')

    stopGuestPreview()
    expect(getPreviewService()).toBeNull()
  })

  it('tells every screen when the view changes', async () => {
    const { subscribeParty } = await import('../../src/services/partySession')
    const seen: (string | null)[] = []
    const off = subscribeParty(() =>
      seen.push(getPartyState().previewingEventId),
    )

    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    stopGuestPreview()
    off()

    expect(seen).toEqual(['event-1', null])
  })

  /** A reload mid-preview must not strand the DJ on guest screens. */
  it('remembers the preview for a reload, and forgets it on the way out', async () => {
    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    expect(sessionStorage.getItem('soundboard.guestPreview')).toContain(
      'event-1',
    )

    stopGuestPreview()
    expect(sessionStorage.getItem('soundboard.guestPreview')).toBeNull()
  })

  it('rebuilds the preview after a reload', async () => {
    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    // A reload: module state is gone, storage is not.
    __resetPartySession()
    sessionStorage.setItem(
      'soundboard.guestPreview',
      JSON.stringify({
        eventId: 'event-1',
        code: 'ABCD',
        displayName: 'You (preview)',
      }),
    )

    const { resumeParty } = await import('../../src/services/partySession')
    await resumeParty()

    expect(getPartyState().previewingEventId).toBe('event-1')
  })

  it('switching events replaces the one being previewed', async () => {
    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    await startGuestPreview('event-2', 'EFGH', 'You (preview)')
    expect(getPartyState().previewingEventId).toBe('event-2')
  })

  it('leaves the DJ’s own backend in place while previewing in demo mode', async () => {
    // Demo mode has one local database and no second identity to establish, so
    // the service does not change — only which screens are being shown.
    await startGuestPreview('event-1', 'ABCD', 'You (preview)')
    expect(getActiveService()).toBe(getDataService())
  })
})

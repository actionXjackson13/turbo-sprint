import { beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import { FIELD_LIMITS } from '../../src/data/constants'

/**
 * The DJ's message to the room, on the backend that runs a party with no
 * server. It has to agree with the Postgres function in
 * `0008_announcements.sql` — the same rules, checked the same way — because a
 * guest cannot tell which one they are talking to.
 */
describe('messaging the guests', () => {
  let dj: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    dj = new DemoService()
    await dj.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    const event = await dj.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id
  })

  it('posts a message that expires after the chosen time', async () => {
    const before = Date.now()
    const event = await dj.setAnnouncement(eventId, {
      message: 'Last orders!',
      durationSeconds: 300,
    })

    expect(event.announcement?.message).toBe('Last orders!')
    const expiresIn =
      new Date(event.announcement!.expiresAt).getTime() - before
    expect(expiresIn).toBeGreaterThan(4 * 60_000)
    expect(expiresIn).toBeLessThan(6 * 60_000)
  })

  it('reaches the guests, who read it off the event', async () => {
    await dj.setAnnouncement(eventId, {
      message: 'Happy birthday Sam',
      durationSeconds: 60,
    })

    const asGuestSees = await dj.getEventById(eventId)
    expect(asGuestSees?.announcement?.message).toBe('Happy birthday Sam')
  })

  it('clears the message when passed nothing', async () => {
    await dj.setAnnouncement(eventId, {
      message: 'Temporary',
      durationSeconds: 60,
    })
    const event = await dj.setAnnouncement(eventId, null)
    expect(event.announcement).toBeNull()
  })

  it('treats a blank message as clearing it', async () => {
    const event = await dj.setAnnouncement(eventId, {
      message: '   ',
      durationSeconds: 60,
    })
    expect(event.announcement).toBeNull()
  })

  it('refuses one too long to sit above the current track', async () => {
    await expect(
      dj.setAnnouncement(eventId, {
        message: 'x'.repeat(FIELD_LIMITS.announcement + 1),
        durationSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('refuses a duration that would never expire', async () => {
    await expect(
      dj.setAnnouncement(eventId, { message: 'Forever', durationSeconds: 0 }),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  /**
   * The row keeps the last message it was given, so "is one showing" is a
   * question about the clock rather than about the data. Screens answer it
   * themselves, which is what lets a message disappear on time instead of
   * whenever the next refresh happens to land — see AnnouncementBanner.
   */
  it('leaves an expired message on the record for the screen to ignore', async () => {
    await dj.setAnnouncement(eventId, {
      message: 'Ends soon',
      durationSeconds: 1,
    })
    await new Promise((r) => setTimeout(r, 1_100))

    const later = await dj.getEventById(eventId)
    expect(later?.announcement?.message).toBe('Ends soon')
    expect(new Date(later!.announcement!.expiresAt).getTime()).toBeLessThan(
      Date.now(),
    )
  })

  it('is not something a guest can post', async () => {
    await dj.signOutDj()
    await expect(
      dj.setAnnouncement(eventId, { message: 'Mine now', durationSeconds: 60 }),
    ).rejects.toBeInstanceOf(ServiceError)
  })
})

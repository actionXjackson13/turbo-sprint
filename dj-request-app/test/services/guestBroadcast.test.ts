import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'

/**
 * Telling the other phone.
 *
 * Blocking a guest looked like it worked, because the DJ's own list reloads
 * straight after the tap. The fault was only ever visible from the guest's
 * side: nothing was watching who is at the event, so their screen went on
 * offering the request form until some unrelated subscription happened to
 * fire — which in practice meant when the next song started. Being refused a
 * song a minute after being blocked is indistinguishable from a broken app.
 *
 * The roster now has a channel of its own. These run against the demo backend,
 * which is the one that can be driven end to end here; the Supabase side is the
 * same idea one layer down — `event_guests` added to the realtime publication
 * in migration 0016, and its existing row-level rules already say a guest sees
 * only their own row and the DJ sees their own event.
 */

let service: DemoService
let eventId: string

beforeEach(async () => {
  resetDemoDb()
  service = new DemoService()
  await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
  const event = await service.getEventByCode(DEMO_EVENT_CODE)
  eventId = event!.id
})

describe('who is at the event', () => {
  it('announces a guest being blocked', async () => {
    const guests = await service.listEventGuests(eventId)
    const target = guests[0]!

    const heard = vi.fn()
    const off = service.subscribeGuests(eventId, heard)

    await service.setGuestBlocked(eventId, target.id, true)

    expect(heard).toHaveBeenCalled()
    off()
  })

  it('announces them being let back in', async () => {
    const guests = await service.listEventGuests(eventId)
    const target = guests[0]!
    await service.setGuestBlocked(eventId, target.id, true)

    const heard = vi.fn()
    const off = service.subscribeGuests(eventId, heard)

    await service.setGuestBlocked(eventId, target.id, false)

    expect(heard).toHaveBeenCalled()
    off()
  })

  /** The DJ's guest count sat still all night while people arrived. */
  it('announces a new arrival', async () => {
    const heard = vi.fn()
    const off = service.subscribeGuests(eventId, heard)

    await service.joinEvent(DEMO_EVENT_CODE, 'Newcomer')

    expect(heard).toHaveBeenCalled()
    off()
  })

  it('says nothing once nobody is listening', async () => {
    const guests = await service.listEventGuests(eventId)
    const target = guests[0]!

    const heard = vi.fn()
    service.subscribeGuests(eventId, heard)()

    await service.setGuestBlocked(eventId, target.id, true)

    expect(heard).not.toHaveBeenCalled()
  })

  /** Two parties on one device must not hear each other's roster. */
  it('keeps events apart', async () => {
    const other = await service.createEvent('Another Night')
    const guests = await service.listEventGuests(eventId)

    const heard = vi.fn()
    const off = service.subscribeGuests(other.id, heard)

    await service.setGuestBlocked(eventId, guests[0]!.id, true)

    expect(heard).not.toHaveBeenCalled()
    off()
  })

  /**
   * Request lists grey out a blocked guest's rows, so they want to know too —
   * this must not become an either/or with the channel it used to borrow.
   */
  it('still tells the request lists', async () => {
    const guests = await service.listEventGuests(eventId)
    const heard = vi.fn()
    const off = service.subscribeSongRequests(eventId, heard)

    await service.setGuestBlocked(eventId, guests[0]!.id, true)

    expect(heard).toHaveBeenCalled()
    off()
  })
})

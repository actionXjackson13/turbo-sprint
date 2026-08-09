import { beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'

/**
 * The DJ putting their own songs in.
 *
 * Everything in the queue used to have arrived by being asked for, and the
 * shape of a DJ-added song is what makes it not quite a request: no guest
 * behind it, no founding vote, and queued from the outset rather than pending
 * approval from the person who just added it. Those three are easy to get
 * wrong by reaching for createSongRequest, and each one would show up somewhere
 * odd — a phantom vote in the tally, a song waiting for its own author to
 * approve it, a guest's request cap consumed by the DJ.
 */
describe('a DJ adding their own song', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    const event = await service.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id
  })

  it('goes straight into the queue, not into pending', async () => {
    const added = await service.addDjSong({
      eventId,
      title: 'Blue Monday',
      artist: 'New Order',
    })

    expect(added.status).toBe('queued')
    expect(added.queuePosition).not.toBeNull()
  })

  it('belongs to no guest and carries no votes', async () => {
    const added = await service.addDjSong({
      eventId,
      title: 'Blue Monday',
      artist: 'New Order',
    })

    expect(added.guestId).toBeNull()
    // A founding vote would put the DJ's own pick on the most-wanted list as
    // though the room had asked for it.
    expect(added.voteCount).toBe(0)
  })

  it('is named, so guests can tell it from the room’s picks', async () => {
    const added = await service.addDjSong({
      eventId,
      title: 'Blue Monday',
      artist: 'New Order',
    })

    expect(added.guestDisplayName).toBeTruthy()
    expect(added.guestDisplayName).not.toBe('')
  })

  it('lands at the back of the queue', async () => {
    const before = await service.listSongRequests(eventId, {
      statuses: ['queued'],
    })
    const added = await service.addDjSong({
      eventId,
      title: 'Blue Monday',
      artist: 'New Order',
    })

    const positions = before
      .map((r) => r.queuePosition ?? 0)
      .concat(-1)
    expect(added.queuePosition).toBeGreaterThan(Math.max(...positions))
  })

  it('keeps the catalogue identity when the song came from search', async () => {
    const added = await service.addDjSong({
      eventId,
      title: 'Blue Monday',
      artist: 'New Order',
      catalogId: '12345',
      artworkUrl: 'https://example.test/art.jpg',
      catalogUrl: 'https://music.apple.com/track/12345',
    })

    // Artwork is what makes the queue scannable, and the player resolves the
    // song by title and artist — both have to survive the trip.
    expect(added.catalogId).toBe('12345')
    expect(added.artworkUrl).toBe('https://example.test/art.jpg')
  })

  it('refuses a song with no title', async () => {
    await expect(
      service.addDjSong({ eventId, title: '   ', artist: 'New Order' }),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  /** The intake gate is about managing the room, not the person managing it. */
  it('works even while requests are closed to guests', async () => {
    await service.updateEventSettings(eventId, { requestStatus: 'closed' })

    const added = await service.addDjSong({
      eventId,
      title: 'Blue Monday',
      artist: 'New Order',
    })
    expect(added.status).toBe('queued')
  })

  it('refuses once the event has ended', async () => {
    await service.endEvent(eventId)

    await expect(
      service.addDjSong({ eventId, title: 'Blue Monday', artist: 'New Order' }),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('is refused to anyone who does not own the event', async () => {
    await service.signOutDj()

    await expect(
      service.addDjSong({ eventId, title: 'Blue Monday', artist: 'New Order' }),
    ).rejects.toBeInstanceOf(ServiceError)
  })
})

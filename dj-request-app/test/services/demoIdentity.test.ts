import { beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  addDemoPersona,
  getActiveDemoPersona,
  listDemoPersonas,
  switchDemoPersona,
} from '../../src/services/demo/demoIdentity'
import {
  DEMO_EVENT_CODE,
  DEMO_GUEST_DISPLAY_NAME,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import { MAX_ACTIVE_REQUESTS_PER_GUEST } from '../../src/data/constants'

/**
 * Demo mode can act as more than one guest. These cover the part that is easy
 * to get wrong: that switching genuinely re-scopes identity rather than just
 * relabelling the UI, so "mine", the per-guest request cap and one-vote-each
 * all follow the guest you are currently being.
 */
describe('demo personas', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    const event = await service.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id
  })

  const personaNamed = (name: string) => {
    const match = listDemoPersonas(eventId).find(
      (p) => p.displayName === name,
    )
    expect(match, `no seeded persona named ${name}`).toBeDefined()
    return match!
  }

  it('starts as the seeded guest', () => {
    expect(getActiveDemoPersona(eventId)?.displayName).toBe(
      DEMO_GUEST_DISPLAY_NAME,
    )
  })

  it('lists everyone at the event in join order', () => {
    expect(listDemoPersonas(eventId).map((p) => p.displayName)).toEqual([
      'Priya',
      'Marcus',
      'Ellie',
      'Tomás',
      DEMO_GUEST_DISPLAY_NAME,
      'Jess',
    ])
  })

  it('re-scopes the session and "my requests" when switching', async () => {
    const mineBefore = await service.getMyRequests(eventId)
    expect(mineBefore.map((r) => r.title)).toContain('Dancing Queen')

    switchDemoPersona(personaNamed('Priya').guestUserId)

    const session = await service.getGuestSession(eventId)
    expect(session?.displayName).toBe('Priya')

    const mineAfter = await service.getMyRequests(eventId)
    expect(mineAfter.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Levitating', 'Rasputin']),
    )
    expect(mineAfter.map((r) => r.title)).not.toContain('Dancing Queen')
  })

  it('attributes a new request to the acting guest', async () => {
    switchDemoPersona(personaNamed('Marcus').guestUserId)

    const created = await service.createSongRequest({
      eventId,
      title: 'Take On Me',
      artist: 'a-ha',
    })

    expect(created.guestDisplayName).toBe('Marcus')
    expect(created.guestId).toBe(personaNamed('Marcus').guestId)
  })

  it('gives each guest their own request allowance', async () => {
    // Fill this guest's allowance, counting the seeded request they already
    // have open.
    const alreadyOpen = (await service.getMyRequests(eventId)).filter((r) =>
      ['pending', 'accepted', 'queued'].includes(r.status),
    ).length

    for (let i = alreadyOpen; i < MAX_ACTIVE_REQUESTS_PER_GUEST; i += 1) {
      await service.createSongRequest({
        eventId,
        title: `Filler ${i}`,
        artist: 'Various',
      })
    }

    await expect(
      service.createSongRequest({
        eventId,
        title: 'One Too Many',
        artist: 'Various',
      }),
    ).rejects.toMatchObject({ code: 'limit_reached' })

    // A different guest is a different budget — this is the whole point of
    // being able to add people in the demo.
    switchDemoPersona(personaNamed('Jess').guestUserId)
    await expect(
      service.createSongRequest({
        eventId,
        title: 'One Too Many',
        artist: 'Various',
      }),
    ).resolves.toMatchObject({ guestDisplayName: 'Jess' })
  })

  it('counts a vote per guest rather than per browser', async () => {
    const target = (await service.listSongRequests(eventId)).find(
      (r) => r.title === 'Pepas',
    )!
    expect(target.voteCount).toBe(1)

    await service.voteRequest(target.id)
    switchDemoPersona(personaNamed('Priya').guestUserId)
    await service.voteRequest(target.id)

    const after = await service.getSongRequest(target.id)
    expect(after!.voteCount).toBe(3)

    // Each guest sees only their own vote.
    expect(await service.getMyRequestVotes(eventId)).toContain(target.id)
    switchDemoPersona(personaNamed('Ellie').guestUserId)
    expect(await service.getMyRequestVotes(eventId)).not.toContain(target.id)
  })

  it('adds a guest and switches to them', async () => {
    const added = addDemoPersona(eventId, '  Sam  ')

    expect(added.displayName).toBe('Sam')
    expect(getActiveDemoPersona(eventId)?.guestUserId).toBe(added.guestUserId)
    expect(listDemoPersonas(eventId).map((p) => p.displayName)).toContain('Sam')

    // Brand new, so nothing is theirs yet.
    expect(await service.getMyRequests(eventId)).toEqual([])
    expect(await service.getEventGuestCount(eventId)).toBe(7)
  })

  it('refuses a blank guest name', () => {
    expect(() => addDemoPersona(eventId, '   ')).toThrow(ServiceError)
    expect(getActiveDemoPersona(eventId)?.displayName).toBe(
      DEMO_GUEST_DISPLAY_NAME,
    )
  })

  it('returns to the seeded guest on reset', () => {
    const added = addDemoPersona(eventId, 'Sam')
    expect(getActiveDemoPersona(eventId)?.guestUserId).toBe(added.guestUserId)

    resetDemoDb()

    expect(getActiveDemoPersona(eventId)?.displayName).toBe(
      DEMO_GUEST_DISPLAY_NAME,
    )
    expect(listDemoPersonas(eventId).map((p) => p.displayName)).not.toContain(
      'Sam',
    )
  })
})

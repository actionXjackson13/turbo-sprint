import { beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import { isDjSong } from '../../src/features/requests/queueOrdering'

/**
 * Sets: the DJ's reusable song lists.
 *
 * The property that matters most is that loading a set *copies* its songs. A
 * set is edited between nights — renamed, reordered, songs swapped out — and if
 * a queued song pointed back at the set row instead of carrying its own copy,
 * editing it on Tuesday would silently rewrite what Friday's guests saw
 * playing.
 */
describe('the DJ’s sets', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    const event = await service.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id
  })

  describe('building one', () => {
    it('creates an empty set and lists it', async () => {
      const set = await service.createDjSet('Peak hour')
      expect(set.name).toBe('Peak hour')
      expect(set.songs).toEqual([])

      const all = await service.listDjSets()
      expect(all.map((s) => s.name)).toContain('Peak hour')
    })

    it('refuses a set with no name', async () => {
      await expect(service.createDjSet('   ')).rejects.toBeInstanceOf(
        ServiceError,
      )
    })

    it('keeps songs in the order they were added', async () => {
      const set = await service.createDjSet('Ordered')
      await service.addSongToSet(set.id, { title: 'One', artist: 'A' })
      await service.addSongToSet(set.id, { title: 'Two', artist: 'B' })
      const after = await service.addSongToSet(set.id, {
        title: 'Three',
        artist: 'C',
      })

      expect(after.songs.map((s) => s.title)).toEqual(['One', 'Two', 'Three'])
      expect(after.songs.map((s) => s.displayOrder)).toEqual([0, 1, 2])
    })

    it('renumbers after a removal, so the order stays dense', async () => {
      const set = await service.createDjSet('Gappy')
      await service.addSongToSet(set.id, { title: 'One', artist: 'A' })
      const two = await service.addSongToSet(set.id, {
        title: 'Two',
        artist: 'B',
      })
      await service.addSongToSet(set.id, { title: 'Three', artist: 'C' })

      const middle = two.songs.find((s) => s.title === 'Two')!
      const after = await service.removeSongFromSet(set.id, middle.id)

      expect(after.songs.map((s) => s.title)).toEqual(['One', 'Three'])
      // A gap would survive into the queue as an ordering nobody chose.
      expect(after.songs.map((s) => s.displayOrder)).toEqual([0, 1])
    })

    it('carries catalogue identity through, so artwork survives', async () => {
      const set = await service.createDjSet('With art')
      const after = await service.addSongToSet(set.id, {
        title: 'Levitating',
        artist: 'Dua Lipa',
        catalogId: '999',
        artworkUrl: 'https://example.test/art.jpg',
      })

      expect(after.songs[0]!.catalogId).toBe('999')
      expect(after.songs[0]!.artworkUrl).toBe('https://example.test/art.jpg')
    })

    it('renames and deletes', async () => {
      const set = await service.createDjSet('Old name')
      const renamed = await service.renameDjSet(set.id, 'New name')
      expect(renamed.name).toBe('New name')

      await service.deleteDjSet(set.id)
      expect(await service.getDjSet(set.id)).toBeNull()
    })
  })

  describe('loading one into a queue', () => {
    it('adds every song, as the DJ’s own', async () => {
      const set = await service.createDjSet('Warm-up 2')
      await service.addSongToSet(set.id, { title: 'One', artist: 'A' })
      await service.addSongToSet(set.id, { title: 'Two', artist: 'B' })

      // Both counts come back now: what landed, and what the night already had.
      expect(await service.loadSetIntoQueue(eventId, set.id)).toEqual({
        added: 2,
        skipped: 0,
      })

      const queue = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      const mine = queue.filter((r) => r.title === 'One' || r.title === 'Two')
      expect(mine).toHaveLength(2)
      // Not the room's — nobody asked for these.
      expect(mine.every(isDjSong)).toBe(true)
      expect(mine.every((r) => r.voteCount === 0)).toBe(true)
    })

    it('lands at the back, in set order', async () => {
      const set = await service.createDjSet('In order')
      await service.addSongToSet(set.id, { title: 'First', artist: 'A' })
      await service.addSongToSet(set.id, { title: 'Second', artist: 'B' })

      const before = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      const highest = Math.max(-1, ...before.map((r) => r.queuePosition ?? 0))

      await service.loadSetIntoQueue(eventId, set.id)

      const after = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      const first = after.find((r) => r.title === 'First')!
      const second = after.find((r) => r.title === 'Second')!

      expect(first.queuePosition!).toBeGreaterThan(highest)
      expect(second.queuePosition!).toBeGreaterThan(first.queuePosition!)
    })

    /**
     * The reason loading copies instead of linking. A set is edited between
     * nights; a night already played must not change under it.
     */
    it('is unaffected by the set being edited afterwards', async () => {
      const set = await service.createDjSet('Mutable')
      const withSong = await service.addSongToSet(set.id, {
        title: 'Original',
        artist: 'A',
      })
      await service.loadSetIntoQueue(eventId, set.id)

      await service.removeSongFromSet(set.id, withSong.songs[0]!.id)
      await service.renameDjSet(set.id, 'Renamed')
      await service.deleteDjSet(set.id)

      const queue = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      expect(queue.some((r) => r.title === 'Original')).toBe(true)
    })

    it('refuses once the event has ended', async () => {
      const set = await service.createDjSet('Too late')
      await service.addSongToSet(set.id, { title: 'One', artist: 'A' })
      await service.endEvent(eventId)

      await expect(
        service.loadSetIntoQueue(eventId, set.id),
      ).rejects.toBeInstanceOf(ServiceError)
    })
  })

  describe('privacy', () => {
    it('shows nothing to a signed-out client', async () => {
      await service.createDjSet('Mine')
      await service.signOutDj()

      expect(await service.listDjSets()).toEqual([])
    })

    it('refuses to edit a set without being signed in', async () => {
      const set = await service.createDjSet('Mine')
      await service.signOutDj()

      await expect(
        service.addSongToSet(set.id, { title: 'X', artist: 'Y' }),
      ).rejects.toBeInstanceOf(ServiceError)
    })
  })
})

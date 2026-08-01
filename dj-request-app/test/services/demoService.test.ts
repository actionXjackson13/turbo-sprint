import { beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import { MAX_ACTIVE_REQUESTS_PER_GUEST } from '../../src/data/constants'

/**
 * These cover the rules the database also enforces. Verifying them here means
 * demo mode cannot quietly diverge from the RLS/trigger behaviour.
 */
describe('DemoService', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    const event = await service.getEventByCode(DEMO_EVENT_CODE)
    eventId = event!.id
  })

  describe('vote counts', () => {
    it('derives vote counts from vote records', async () => {
      const requests = await service.listSongRequests(eventId)
      const levitating = requests.find((r) => r.title === 'Levitating')!
      expect(levitating.voteCount).toBe(5)
    })

    it('increments on vote and is idempotent', async () => {
      const before = await service.listSongRequests(eventId)
      const target = before.find((r) => r.title === 'Pepas')!
      expect(target.voteCount).toBe(1)

      await service.voteRequest(target.id)
      await service.voteRequest(target.id) // repeat should not double-count

      const after = await service.getSongRequest(target.id)
      expect(after!.voteCount).toBe(2)
    })

    it('lets a guest withdraw a vote they added', async () => {
      const requests = await service.listSongRequests(eventId)
      const target = requests.find((r) => r.title === 'Pepas')!

      await service.voteRequest(target.id)
      await service.removeRequestVote(target.id)

      const after = await service.getSongRequest(target.id)
      expect(after!.voteCount).toBe(1)
    })

    it('refuses to remove the submitter’s founding vote', async () => {
      const mine = await service.getMyRequests(eventId)
      const own = mine.find((r) => r.title === 'Dancing Queen')!

      await expect(service.removeRequestVote(own.id)).rejects.toThrow(
        ServiceError,
      )
    })
  })

  describe('duplicate detection', () => {
    it('matches ignoring case and punctuation', async () => {
      const match = await service.findSimilarRequest(
        eventId,
        '  levitating!! ',
        'Dua   Lipa',
      )
      expect(match?.title).toBe('Levitating')
    })

    it('matches through a typo', async () => {
      // The seed has "Blinding Lights" / "The Weeknd".
      const match = await service.findSimilarRequest(
        eventId,
        'Blinding Light',
        'The Weekend',
      )
      expect(match?.title).toBe('Blinding Lights')
    })

    it('matches across apostrophe spelling', async () => {
      await service.createSongRequest({
        eventId,
        title: "Don't Stop Believing",
        artist: 'Journey',
      })

      const match = await service.findSimilarRequest(
        eventId,
        'Dont Stop Believin',
        'Journey',
      )
      expect(match?.title).toBe("Don't Stop Believing")
    })

    it('keeps the same title by a different artist apart', async () => {
      await service.createSongRequest({
        eventId,
        title: 'Hello',
        artist: 'Adele',
      })

      const match = await service.findSimilarRequest(
        eventId,
        'Hello',
        'Lionel Richie',
      )
      expect(match).toBeNull()
    })

    it('prefers an exact match over a merely similar one', async () => {
      await service.createSongRequest({
        eventId,
        title: 'Sweet Caroline',
        artist: 'Neil Diamond',
      })
      await service.createSongRequest({
        eventId,
        title: 'Sweet Carolina',
        artist: 'Neil Diamond',
      })

      const match = await service.findSimilarRequest(
        eventId,
        'sweet carolina',
        'neil diamond',
      )
      expect(match?.title).toBe('Sweet Carolina')
    })

    it('does not match a declined request', async () => {
      const match = await service.findSimilarRequest(
        eventId,
        'Free Bird',
        'Lynyrd Skynyrd',
      )
      expect(match).toBeNull()
    })

    it('returns null for a genuinely new song', async () => {
      const match = await service.findSimilarRequest(
        eventId,
        'Brand New Song',
        'Nobody',
      )
      expect(match).toBeNull()
    })
  })

  describe('request intake', () => {
    it('rejects requests while paused', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      await service.updateEventSettings(eventId, { requestStatus: 'paused' })

      await expect(
        service.createSongRequest({
          eventId,
          title: 'Anything',
          artist: 'Someone',
        }),
      ).rejects.toMatchObject({ code: 'requests_closed' })
    })

    it('caps a guest at five active requests', async () => {
      // The seed already gives this guest one active request.
      const existing = (await service.getMyRequests(eventId)).filter((r) =>
        ['pending', 'accepted', 'queued'].includes(r.status),
      ).length

      for (let i = existing; i < MAX_ACTIVE_REQUESTS_PER_GUEST; i++) {
        await service.createSongRequest({
          eventId,
          title: `Song ${i}`,
          artist: `Artist ${i}`,
        })
      }

      await expect(
        service.createSongRequest({
          eventId,
          title: 'One Too Many',
          artist: 'Nobody',
        }),
      ).rejects.toMatchObject({ code: 'limit_reached' })
    })

    it('blocks a blocked guest from requesting', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const guest = await service.getGuestSession(eventId)
      await service.setGuestBlocked(eventId, guest!.id, true)

      await expect(
        service.createSongRequest({
          eventId,
          title: 'Anything',
          artist: 'Someone',
        }),
      ).rejects.toMatchObject({ code: 'blocked' })
    })

    it('gives a new request a founding vote', async () => {
      const created = await service.createSongRequest({
        eventId,
        title: 'Fresh Track',
        artist: 'New Artist',
      })
      expect(created.voteCount).toBe(1)
      expect(created.status).toBe('pending')
    })
  })

  describe('DJ ownership', () => {
    it('refuses event management when signed out', async () => {
      await expect(
        service.updateEventSettings(eventId, { requestStatus: 'closed' }),
      ).rejects.toMatchObject({ code: 'forbidden' })
    })

    it('refuses management by a different DJ', async () => {
      await service.signUpDj('other@example.com', 'password', 'DJ Other')

      await expect(
        service.updateEventSettings(eventId, { requestStatus: 'closed' }),
      ).rejects.toMatchObject({ code: 'forbidden' })
    })
  })

  describe('queue', () => {
    it('assigns a queue position when a request is queued', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const requests = await service.listSongRequests(eventId)
      const pending = requests.find((r) => r.status === 'pending')!

      const updated = await service.updateRequestStatus(pending.id, 'queued')
      expect(updated.queuePosition).not.toBeNull()
    })

    it('clears the queue position when moved out of the queue', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const requests = await service.listSongRequests(eventId)
      const queued = requests.find((r) => r.status === 'queued')!

      const updated = await service.updateRequestStatus(queued.id, 'played')
      expect(updated.queuePosition).toBeNull()
    })

    it('applies a manual reorder', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const queued = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      const reversed = [...queued].reverse().map((r) => r.id)

      await service.reorderQueue(eventId, reversed)

      const after = await service.listSongRequests(eventId, {
        statuses: ['queued'],
      })
      const byPosition = [...after].sort(
        (a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0),
      )
      expect(byPosition.map((r) => r.id)).toEqual(reversed)
    })
  })

  describe('voting rounds', () => {
    it('lets a guest vote and then change their vote', async () => {
      const round = await service.getActiveVotingRound(eventId)
      expect(round).not.toBeNull()

      const [first, second] = round!.options

      await service.castRoundVote(round!.id, first!.id)
      let results = await service.getVotingRoundResults(round!.id)
      expect(results.myOptionId).toBe(first!.id)
      const totalAfterFirst = results.totalVotes

      await service.castRoundVote(round!.id, second!.id)
      results = await service.getVotingRoundResults(round!.id)
      expect(results.myOptionId).toBe(second!.id)
      // Changing a vote must move it, not add a second one.
      expect(results.totalVotes).toBe(totalAfterFirst)
    })

    it('rejects votes once the round has ended', async () => {
      const round = await service.getActiveVotingRound(eventId)
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      await service.endVotingRound(round!.id)

      await expect(
        service.castRoundVote(round!.id, round!.options[0]!.id),
      ).rejects.toMatchObject({ code: 'round_closed' })
    })

    it('resolves the winner by vote count when ended', async () => {
      const round = await service.getActiveVotingRound(eventId)
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)

      const ended = await service.endVotingRound(round!.id)
      // Seed gives option 1 two votes, the others one each.
      expect(ended.winnerOptionId).toBe(round!.options[0]!.id)
    })

    it('finalises an expired round without DJ action', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const existing = await service.getActiveVotingRound(eventId)
      await service.cancelVotingRound(existing!.id)

      const round = await service.createVotingRound({
        eventId,
        durationSeconds: 30,
        options: [
          { title: 'A', artist: 'X' },
          { title: 'B', artist: 'Y' },
        ],
      })

      // Not expired yet.
      expect(await service.finalizeVotingRoundIfExpired(round.id)).toBeNull()

      // Simulate the clock passing the end time.
      const realNow = Date.now
      Date.now = () => realNow() + 31_000
      try {
        const finalized = await service.finalizeVotingRoundIfExpired(round.id)
        expect(finalized?.status).toBe('ended')
      } finally {
        Date.now = realNow
      }
    })

    it('enforces two to four options', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const existing = await service.getActiveVotingRound(eventId)
      await service.cancelVotingRound(existing!.id)

      await expect(
        service.createVotingRound({
          eventId,
          durationSeconds: null,
          options: [{ title: 'Only One', artist: 'X' }],
        }),
      ).rejects.toMatchObject({ code: 'invalid_input' })
    })

    it('allows only one active round per event', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)

      await expect(
        service.createVotingRound({
          eventId,
          durationSeconds: null,
          options: [
            { title: 'A', artist: 'X' },
            { title: 'B', artist: 'Y' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'invalid_input' })
    })

    it('pushes the winner into the queue', async () => {
      await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      const round = await service.getActiveVotingRound(eventId)
      const ended = await service.endVotingRound(round!.id)

      const queued = await service.pushWinnerToQueue(
        ended.id,
        ended.winnerOptionId!,
      )

      expect(queued.status).toBe('queued')
      expect(queued.sourceRoundId).toBe(ended.id)
      expect(queued.guestId).toBeNull()
    })
  })

  describe('guest session', () => {
    it('persists the guest across service instances', async () => {
      const before = await service.getGuestSession(eventId)
      expect(before).not.toBeNull()

      // A new instance stands in for a page refresh.
      const fresh = new DemoService()
      const after = await fresh.getGuestSession(eventId)
      expect(after?.id).toBe(before?.id)
    })

    it('rejoining updates the name instead of duplicating membership', async () => {
      const before = await service.getEventGuestCount(eventId)
      const { guest } = await service.joinEvent(DEMO_EVENT_CODE, 'Renamed')

      expect(guest.displayName).toBe('Renamed')
      expect(await service.getEventGuestCount(eventId)).toBe(before)
    })
  })
})

import type {
  EventGuest,
  EventRecord,
  Profile,
  RequestSort,
  RequestStatus,
  SongRequest,
  VotingOption,
  VotingRound,
  VotingRoundResults,
} from '../../types/domain'
import { ACTIVE_REQUEST_STATUSES } from '../../types/domain'
import {
  ServiceError,
  type CreateRequestInput,
  type CreateVotingRoundInput,
  type DataService,
  type EventSettingsPatch,
  type GuestIdentity,
  type Unsubscribe,
} from '../types'
import {
  channels,
  demoDelay,
  getDb,
  mutate,
  nowIso,
  subscribe,
  type StoredVotingRound,
} from './demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
} from './seed'
import { songMatchKey } from '../../utils/normalizeText'
import {
  MAX_ACTIVE_REQUESTS_PER_GUEST,
  MAX_VOTING_OPTIONS,
  MIN_VOTING_OPTIONS,
} from '../../data/constants'
import { generateEventCode, normalizeEventCode } from '../../data/eventCodeGenerator'

/**
 * In-memory implementation of the data contract.
 *
 * It intentionally enforces the same rules the database does — intake status,
 * the five-active-request cap, one vote per guest, founding votes being
 * unremovable, expired rounds rejecting votes — so that behaviour verified in
 * demo mode is the behaviour you get against Supabase.
 */
export class DemoService implements DataService {
  // ---- DJ authentication -------------------------------------------------

  async signUpDj(
    _email: string,
    _password: string,
    displayName: string,
  ): Promise<Profile> {
    await demoDelay()

    // Demo mode stores no credentials — there is nothing to authenticate
    // against. Sign-up simply creates a profile and signs it in.
    return mutate((db) => {
      const profile: Profile = {
        id: `demo-dj-${crypto.randomUUID().slice(0, 8)}`,
        displayName: displayName.trim(),
        createdAt: nowIso(),
      }
      db.profiles.push(profile)
      db.currentDjId = profile.id
      return profile
    })
  }

  async signInDj(email: string, password: string): Promise<Profile> {
    await demoDelay()
    const normalized = email.trim().toLowerCase()

    // Demo mode accepts the sample credentials, or any account created during
    // this session (passwords are not stored — there is nothing to protect).
    return mutate((db) => {
      const isSampleDj =
        normalized === DEMO_DJ_EMAIL && password === DEMO_DJ_PASSWORD
      const profile = isSampleDj
        ? db.profiles[0]
        : db.profiles.find((p) => p.id === db.currentDjId) ?? db.profiles[0]

      if (!profile) {
        throw new ServiceError('unauthorized', 'Incorrect email or password.')
      }
      if (!isSampleDj && password.length < 6) {
        throw new ServiceError('unauthorized', 'Incorrect email or password.')
      }

      db.currentDjId = profile.id
      return profile
    })
  }

  async signOutDj(): Promise<void> {
    await demoDelay(60)
    mutate((db) => {
      db.currentDjId = null
    })
    this.authListeners.forEach((cb) => cb(null))
  }

  async getCurrentDjProfile(): Promise<Profile | null> {
    const db = getDb()
    if (!db.currentDjId) return null
    return db.profiles.find((p) => p.id === db.currentDjId) ?? null
  }

  private authListeners = new Set<(p: Profile | null) => void>()

  onDjAuthStateChange(cb: (profile: Profile | null) => void): Unsubscribe {
    this.authListeners.add(cb)
    return () => this.authListeners.delete(cb)
  }

  // ---- Guest identity ----------------------------------------------------

  async getOrCreateGuestIdentity(): Promise<GuestIdentity> {
    return { guestUserId: getDb().guestUserId }
  }

  // ---- Events ------------------------------------------------------------

  async createEvent(name: string): Promise<EventRecord> {
    await demoDelay()
    return mutate((db) => {
      const dj = this.requireDj(db.currentDjId, db.profiles)

      let code = generateEventCode()
      while (db.events.some((e) => e.code === code)) code = generateEventCode()

      const event: EventRecord = {
        id: `demo-event-${crypto.randomUUID().slice(0, 8)}`,
        djId: dj.id,
        djDisplayName: dj.displayName,
        name: name.trim(),
        code,
        status: 'active',
        requestStatus: 'open',
        nowPlaying: null,
        createdAt: nowIso(),
        endedAt: null,
      }
      db.events.push(event)
      return event
    })
  }

  async getDjEvents(): Promise<EventRecord[]> {
    await demoDelay()
    const db = getDb()
    if (!db.currentDjId) return []
    return db.events
      .filter((e) => e.djId === db.currentDjId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone)
  }

  async getEventById(eventId: string): Promise<EventRecord | null> {
    const event = getDb().events.find((e) => e.id === eventId)
    return event ? clone(event) : null
  }

  async getEventByCode(code: string): Promise<EventRecord | null> {
    await demoDelay()
    const normalized = normalizeEventCode(code)
    const event = getDb().events.find((e) => e.code === normalized)
    return event ? clone(event) : null
  }

  async updateEventSettings(
    eventId: string,
    patch: EventSettingsPatch,
  ): Promise<EventRecord> {
    await demoDelay(80)
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, eventId)
        if (patch.name !== undefined) event.name = patch.name.trim()
        if (patch.requestStatus !== undefined) {
          event.requestStatus = patch.requestStatus
        }
        return clone(event)
      },
      channels.event(eventId),
    )
  }

  async setNowPlaying(
    eventId: string,
    nowPlaying: {
      title: string
      artist: string
      sourceRequestId: string | null
    } | null,
  ): Promise<EventRecord> {
    await demoDelay(80)
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, eventId)
        event.nowPlaying = nowPlaying

        // Promoting a request to now-playing also retires it from the queue.
        if (nowPlaying?.sourceRequestId) {
          const req = db.requests.find(
            (r) => r.id === nowPlaying.sourceRequestId,
          )
          if (req) {
            req.status = 'played'
            req.queuePosition = null
            req.updatedAt = nowIso()
          }
        }
        return clone(event)
      },
      channels.event(eventId),
      channels.requests(eventId),
    )
  }

  async endEvent(eventId: string): Promise<EventRecord> {
    await demoDelay()
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, eventId)
        event.status = 'ended'
        event.requestStatus = 'closed'
        event.endedAt = nowIso()

        // Close any round still running so guests aren't left voting.
        for (const round of db.rounds) {
          if (round.eventId === eventId && round.status === 'active') {
            round.status = 'cancelled'
            round.endedAt = nowIso()
          }
        }
        return clone(event)
      },
      channels.event(eventId),
      channels.rounds(eventId),
    )
  }

  subscribeEvent(eventId: string, onChange: () => void): Unsubscribe {
    return subscribe(channels.event(eventId), onChange)
  }

  // ---- Guest membership --------------------------------------------------

  async joinEvent(
    code: string,
    displayName: string,
  ): Promise<{ event: EventRecord; guest: EventGuest }> {
    await demoDelay()
    const normalized = normalizeEventCode(code)

    // Resolve the event first so the notification channel is known up front.
    const target = getDb().events.find((e) => e.code === normalized)
    if (!target) {
      throw new ServiceError('not_found', 'No event found with that code.')
    }
    if (target.status === 'ended') {
      throw new ServiceError('forbidden', 'This event has ended.')
    }

    return mutate(
      (db) => {
        const event = db.events.find((e) => e.id === target.id)!

        const existing = db.guests.find(
          (g) => g.eventId === event.id && g.guestUserId === db.guestUserId,
        )
        if (existing) {
          // Rejoining updates the name rather than adding a second membership.
          existing.displayName = displayName.trim()
          return { event: clone(event), guest: clone(existing) }
        }

        const guest: EventGuest = {
          id: `demo-guest-row-${crypto.randomUUID().slice(0, 8)}`,
          eventId: event.id,
          guestUserId: db.guestUserId,
          displayName: displayName.trim(),
          isBlocked: false,
          joinedAt: nowIso(),
        }
        db.guests.push(guest)
        return { event: clone(event), guest: clone(guest) }
      },
      channels.event(target.id),
    )
  }

  async getGuestSession(eventId: string): Promise<EventGuest | null> {
    const db = getDb()
    const guest = db.guests.find(
      (g) => g.eventId === eventId && g.guestUserId === db.guestUserId,
    )
    return guest ? clone(guest) : null
  }

  async getEventGuestCount(eventId: string): Promise<number> {
    return getDb().guests.filter((g) => g.eventId === eventId).length
  }

  async setGuestBlocked(
    eventId: string,
    guestId: string,
    blocked: boolean,
  ): Promise<void> {
    await demoDelay(80)
    mutate(
      (db) => {
        this.requireOwnedEvent(db, eventId)
        const guest = db.guests.find((g) => g.id === guestId)
        if (!guest) throw new ServiceError('not_found', 'Guest not found.')
        guest.isBlocked = blocked
      },
      channels.requests(eventId),
    )
  }

  // ---- Song requests -----------------------------------------------------

  async listSongRequests(
    eventId: string,
    opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
  ): Promise<SongRequest[]> {
    const db = getDb()
    let rows = db.requests.filter((r) => r.eventId === eventId)
    if (opts?.statuses) {
      rows = rows.filter((r) => opts.statuses!.includes(r.status))
    }
    return sortRequests(rows.map(clone), opts?.sort ?? 'newest')
  }

  async getSongRequest(requestId: string): Promise<SongRequest | null> {
    const row = getDb().requests.find((r) => r.id === requestId)
    return row ? clone(row) : null
  }

  async getMyRequests(eventId: string): Promise<SongRequest[]> {
    const db = getDb()
    const guest = db.guests.find(
      (g) => g.eventId === eventId && g.guestUserId === db.guestUserId,
    )
    if (!guest) return []
    return sortRequests(
      db.requests.filter((r) => r.guestId === guest.id).map(clone),
      'newest',
    )
  }

  async findSimilarRequest(
    eventId: string,
    title: string,
    artist: string,
  ): Promise<SongRequest | null> {
    const key = songMatchKey(title, artist)
    const match = getDb().requests.find(
      (r) =>
        r.eventId === eventId &&
        // A previously declined song shouldn't block a fresh ask.
        r.status !== 'declined' &&
        songMatchKey(r.title, r.artist) === key,
    )
    return match ? clone(match) : null
  }

  async createSongRequest(input: CreateRequestInput): Promise<SongRequest> {
    await demoDelay()
    return mutate(
      (db) => {
        const event = db.events.find((e) => e.id === input.eventId)
        if (!event) throw new ServiceError('not_found', 'Event not found.')
        if (event.status === 'ended') {
          throw new ServiceError('forbidden', 'This event has ended.')
        }
        if (event.requestStatus !== 'open') {
          throw new ServiceError(
            'requests_closed',
            event.requestStatus === 'paused'
              ? 'The DJ has paused requests right now.'
              : 'Requests are closed for this event.',
          )
        }

        const guest = db.guests.find(
          (g) => g.eventId === input.eventId && g.guestUserId === db.guestUserId,
        )
        if (!guest) {
          throw new ServiceError('forbidden', 'Join the event before requesting.')
        }
        if (guest.isBlocked) {
          throw new ServiceError(
            'blocked',
            'The DJ has blocked you from making requests at this event.',
          )
        }

        const activeCount = db.requests.filter(
          (r) =>
            r.guestId === guest.id &&
            (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(r.status),
        ).length
        if (activeCount >= MAX_ACTIVE_REQUESTS_PER_GUEST) {
          throw new ServiceError(
            'limit_reached',
            `You can have ${MAX_ACTIVE_REQUESTS_PER_GUEST} active requests at a time.`,
          )
        }

        const now = nowIso()
        const request: SongRequest = {
          id: `demo-req-${crypto.randomUUID().slice(0, 8)}`,
          eventId: input.eventId,
          guestId: guest.id,
          guestDisplayName: guest.displayName,
          title: input.title.trim(),
          artist: input.artist.trim(),
          voteCount: 1, // the founding vote below
          status: 'pending',
          queuePosition: null,
          sourceRoundId: null,
          createdAt: now,
          updatedAt: now,
        }
        db.requests.push(request)
        db.requestVotes.push({
          id: `demo-vote-${crypto.randomUUID().slice(0, 8)}`,
          requestId: request.id,
          guestId: guest.id,
          isFoundingVote: true,
          createdAt: now,
        })
        return clone(request)
      },
      channels.requests(input.eventId),
    )
  }

  async updateRequestStatus(
    requestId: string,
    status: RequestStatus,
  ): Promise<SongRequest> {
    await demoDelay(80)
    const eventId = getDb().requests.find((r) => r.id === requestId)?.eventId
    return mutate(
      (db) => {
        const request = db.requests.find((r) => r.id === requestId)
        if (!request) throw new ServiceError('not_found', 'Request not found.')
        this.requireOwnedEvent(db, request.eventId)

        request.status = status
        if (status === 'queued') {
          if (request.queuePosition === null) {
            const positions = db.requests
              .filter(
                (r) =>
                  r.eventId === request.eventId &&
                  r.status === 'queued' &&
                  r.queuePosition !== null,
              )
              .map((r) => r.queuePosition!)
            request.queuePosition =
              positions.length > 0 ? Math.max(...positions) + 1 : 0
          }
        } else {
          request.queuePosition = null
        }
        request.updatedAt = nowIso()
        return clone(request)
      },
      channels.requests(eventId ?? ''),
    )
  }

  async deleteRequest(requestId: string): Promise<void> {
    await demoDelay(80)
    const eventId = getDb().requests.find((r) => r.id === requestId)?.eventId
    mutate(
      (db) => {
        const request = db.requests.find((r) => r.id === requestId)
        if (!request) throw new ServiceError('not_found', 'Request not found.')
        this.requireOwnedEvent(db, request.eventId)

        db.requests = db.requests.filter((r) => r.id !== requestId)
        db.requestVotes = db.requestVotes.filter(
          (v) => v.requestId !== requestId,
        )
      },
      channels.requests(eventId ?? ''),
    )
  }

  async reorderQueue(
    eventId: string,
    orderedRequestIds: string[],
  ): Promise<void> {
    await demoDelay(60)
    mutate(
      (db) => {
        this.requireOwnedEvent(db, eventId)
        orderedRequestIds.forEach((id, index) => {
          const request = db.requests.find(
            (r) => r.id === id && r.eventId === eventId,
          )
          if (request) request.queuePosition = index
        })
      },
      channels.requests(eventId),
    )
  }

  subscribeSongRequests(eventId: string, onChange: () => void): Unsubscribe {
    return subscribe(channels.requests(eventId), onChange)
  }

  // ---- Request voting ----------------------------------------------------

  async getMyRequestVotes(eventId: string): Promise<string[]> {
    const db = getDb()
    const guest = db.guests.find(
      (g) => g.eventId === eventId && g.guestUserId === db.guestUserId,
    )
    if (!guest) return []
    const eventRequestIds = new Set(
      db.requests.filter((r) => r.eventId === eventId).map((r) => r.id),
    )
    return db.requestVotes
      .filter((v) => v.guestId === guest.id && eventRequestIds.has(v.requestId))
      .map((v) => v.requestId)
  }

  async voteRequest(requestId: string): Promise<void> {
    await demoDelay(60)
    const eventId = getDb().requests.find((r) => r.id === requestId)?.eventId
    mutate(
      (db) => {
        const request = db.requests.find((r) => r.id === requestId)
        if (!request) throw new ServiceError('not_found', 'Request not found.')

        const guest = this.requireGuest(db, request.eventId)
        if (guest.isBlocked) {
          throw new ServiceError('blocked', 'You cannot vote at this event.')
        }

        const already = db.requestVotes.some(
          (v) => v.requestId === requestId && v.guestId === guest.id,
        )
        // Idempotent: re-voting is a no-op rather than an error, which keeps
        // optimistic UI and realtime updates from fighting each other.
        if (already) return

        db.requestVotes.push({
          id: `demo-vote-${crypto.randomUUID().slice(0, 8)}`,
          requestId,
          guestId: guest.id,
          isFoundingVote: false,
          createdAt: nowIso(),
        })
        request.voteCount = db.requestVotes.filter(
          (v) => v.requestId === requestId,
        ).length
      },
      channels.requests(eventId ?? ''),
    )
  }

  async removeRequestVote(requestId: string): Promise<void> {
    await demoDelay(60)
    const eventId = getDb().requests.find((r) => r.id === requestId)?.eventId
    mutate(
      (db) => {
        const request = db.requests.find((r) => r.id === requestId)
        if (!request) throw new ServiceError('not_found', 'Request not found.')

        const guest = this.requireGuest(db, request.eventId)
        const vote = db.requestVotes.find(
          (v) => v.requestId === requestId && v.guestId === guest.id,
        )
        if (!vote) return

        if (vote.isFoundingVote) {
          throw new ServiceError(
            'forbidden',
            'You cannot remove your vote from your own request.',
          )
        }

        db.requestVotes = db.requestVotes.filter((v) => v.id !== vote.id)
        request.voteCount = db.requestVotes.filter(
          (v) => v.requestId === requestId,
        ).length
      },
      channels.requests(eventId ?? ''),
    )
  }

  // ---- Voting rounds -----------------------------------------------------

  async createVotingRound(input: CreateVotingRoundInput): Promise<VotingRound> {
    await demoDelay()
    return mutate(
      (db) => {
        this.requireOwnedEvent(db, input.eventId)

        if (
          input.options.length < MIN_VOTING_OPTIONS ||
          input.options.length > MAX_VOTING_OPTIONS
        ) {
          throw new ServiceError(
            'invalid_input',
            `A vote needs between ${MIN_VOTING_OPTIONS} and ${MAX_VOTING_OPTIONS} songs.`,
          )
        }

        const alreadyActive = db.rounds.some(
          (r) => r.eventId === input.eventId && r.status === 'active',
        )
        if (alreadyActive) {
          throw new ServiceError(
            'invalid_input',
            'A vote is already running for this event.',
          )
        }

        const now = new Date()
        const round: StoredVotingRound = {
          id: `demo-round-${crypto.randomUUID().slice(0, 8)}`,
          eventId: input.eventId,
          status: 'active',
          durationSeconds: input.durationSeconds,
          startsAt: now.toISOString(),
          endsAt:
            input.durationSeconds === null
              ? null
              : new Date(
                  now.getTime() + input.durationSeconds * 1000,
                ).toISOString(),
          winnerOptionId: null,
          endedAt: null,
          createdAt: now.toISOString(),
        }
        db.rounds.push(round)

        input.options.forEach((opt, index) => {
          db.votingOptions.push({
            id: `demo-opt-${crypto.randomUUID().slice(0, 8)}`,
            roundId: round.id,
            title: opt.title.trim(),
            artist: opt.artist.trim(),
            displayOrder: index,
          })
        })

        return hydrateRound(round, db.votingOptions)
      },
      channels.rounds(input.eventId),
    )
  }

  async getActiveVotingRound(eventId: string): Promise<VotingRound | null> {
    const db = getDb()
    const round = db.rounds.find(
      (r) => r.eventId === eventId && r.status === 'active',
    )
    return round ? hydrateRound(round, db.votingOptions) : null
  }

  async getLatestVotingRound(eventId: string): Promise<VotingRound | null> {
    const db = getDb()
    const round = [...db.rounds]
      .filter((r) => r.eventId === eventId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return round ? hydrateRound(round, db.votingOptions) : null
  }

  async getVotingRoundResults(roundId: string): Promise<VotingRoundResults> {
    const db = getDb()
    const round = db.rounds.find((r) => r.id === roundId)
    if (!round) throw new ServiceError('not_found', 'Vote not found.')

    const options = db.votingOptions.filter((o) => o.roundId === roundId)
    const responses = db.votingResponses.filter((r) => r.roundId === roundId)

    const guest = db.guests.find(
      (g) => g.eventId === round.eventId && g.guestUserId === db.guestUserId,
    )
    const mine = guest
      ? responses.find((r) => r.guestId === guest.id)
      : undefined

    return {
      round: hydrateRound(round, db.votingOptions),
      tallies: options.map((o) => ({
        optionId: o.id,
        votes: responses.filter((r) => r.optionId === o.id).length,
      })),
      totalVotes: responses.length,
      myOptionId: mine?.optionId ?? null,
    }
  }

  async castRoundVote(roundId: string, optionId: string): Promise<void> {
    await demoDelay(60)
    const eventId = getDb().rounds.find((r) => r.id === roundId)?.eventId
    mutate(
      (db) => {
        const round = db.rounds.find((r) => r.id === roundId)
        if (!round) throw new ServiceError('not_found', 'Vote not found.')

        // Mirrors the RLS gate: the server's clock decides, not the client's.
        if (round.status !== 'active') {
          throw new ServiceError('round_closed', 'This vote has ended.')
        }
        if (round.endsAt && new Date(round.endsAt).getTime() <= Date.now()) {
          throw new ServiceError('round_closed', 'This vote has ended.')
        }

        const option = db.votingOptions.find(
          (o) => o.id === optionId && o.roundId === roundId,
        )
        if (!option) throw new ServiceError('not_found', 'Song not found.')

        const guest = this.requireGuest(db, round.eventId)
        if (guest.isBlocked) {
          throw new ServiceError('blocked', 'You cannot vote at this event.')
        }

        const existing = db.votingResponses.find(
          (r) => r.roundId === roundId && r.guestId === guest.id,
        )
        if (existing) {
          // Changing a vote updates the single row, it does not add another.
          existing.optionId = optionId
          existing.updatedAt = nowIso()
        } else {
          const now = nowIso()
          db.votingResponses.push({
            id: `demo-response-${crypto.randomUUID().slice(0, 8)}`,
            roundId,
            optionId,
            guestId: guest.id,
            createdAt: now,
            updatedAt: now,
          })
        }
      },
      channels.rounds(eventId ?? ''),
    )
  }

  async endVotingRound(roundId: string): Promise<VotingRound> {
    await demoDelay(80)
    const eventId = getDb().rounds.find((r) => r.id === roundId)?.eventId
    return mutate(
      (db) => {
        const round = db.rounds.find((r) => r.id === roundId)
        if (!round) throw new ServiceError('not_found', 'Vote not found.')
        this.requireOwnedEvent(db, round.eventId)

        round.status = 'ended'
        round.endedAt = nowIso()
        round.winnerOptionId = resolveWinner(db, roundId)
        return hydrateRound(round, db.votingOptions)
      },
      channels.rounds(eventId ?? ''),
    )
  }

  async cancelVotingRound(roundId: string): Promise<VotingRound> {
    await demoDelay(80)
    const eventId = getDb().rounds.find((r) => r.id === roundId)?.eventId
    return mutate(
      (db) => {
        const round = db.rounds.find((r) => r.id === roundId)
        if (!round) throw new ServiceError('not_found', 'Vote not found.')
        this.requireOwnedEvent(db, round.eventId)

        round.status = 'cancelled'
        round.endedAt = nowIso()
        round.winnerOptionId = null
        return hydrateRound(round, db.votingOptions)
      },
      channels.rounds(eventId ?? ''),
    )
  }

  async finalizeVotingRoundIfExpired(
    roundId: string,
  ): Promise<VotingRound | null> {
    const db0 = getDb()
    const existing = db0.rounds.find((r) => r.id === roundId)
    if (!existing) return null
    // Cheap guard so the countdown hook can call this freely.
    if (
      existing.status !== 'active' ||
      !existing.endsAt ||
      new Date(existing.endsAt).getTime() > Date.now()
    ) {
      return null
    }

    return mutate(
      (db) => {
        const round = db.rounds.find((r) => r.id === roundId)
        // Re-check inside the mutation: another caller may have won the race.
        if (!round || round.status !== 'active') return null
        if (!round.endsAt || new Date(round.endsAt).getTime() > Date.now()) {
          return null
        }

        round.status = 'ended'
        round.endedAt = nowIso()
        round.winnerOptionId = resolveWinner(db, roundId)
        return hydrateRound(round, db.votingOptions)
      },
      channels.rounds(existing.eventId),
    )
  }

  async pushWinnerToQueue(
    roundId: string,
    optionId: string,
  ): Promise<SongRequest> {
    await demoDelay()
    const eventId = getDb().rounds.find((r) => r.id === roundId)?.eventId
    return mutate(
      (db) => {
        const round = db.rounds.find((r) => r.id === roundId)
        if (!round) throw new ServiceError('not_found', 'Vote not found.')
        this.requireOwnedEvent(db, round.eventId)

        const option = db.votingOptions.find(
          (o) => o.id === optionId && o.roundId === roundId,
        )
        if (!option) throw new ServiceError('not_found', 'Song not found.')

        const positions = db.requests
          .filter(
            (r) =>
              r.eventId === round.eventId &&
              r.status === 'queued' &&
              r.queuePosition !== null,
          )
          .map((r) => r.queuePosition!)

        const now = nowIso()
        const request: SongRequest = {
          id: `demo-req-${crypto.randomUUID().slice(0, 8)}`,
          eventId: round.eventId,
          guestId: null,
          guestDisplayName: 'Crowd vote',
          title: option.title,
          artist: option.artist,
          voteCount: db.votingResponses.filter((r) => r.optionId === optionId)
            .length,
          status: 'queued',
          queuePosition: positions.length > 0 ? Math.max(...positions) + 1 : 0,
          sourceRoundId: roundId,
          createdAt: now,
          updatedAt: now,
        }
        db.requests.push(request)
        return clone(request)
      },
      channels.requests(eventId ?? ''),
      channels.rounds(eventId ?? ''),
    )
  }

  subscribeVotingRounds(eventId: string, onChange: () => void): Unsubscribe {
    return subscribe(channels.rounds(eventId), onChange)
  }

  // ---- guards ------------------------------------------------------------

  private requireDj(
    currentDjId: string | null,
    profiles: Profile[],
  ): Profile {
    const dj = profiles.find((p) => p.id === currentDjId)
    if (!dj) throw new ServiceError('unauthorized', 'Sign in to continue.')
    return dj
  }

  /**
   * Demo mode enforces DJ ownership too, so that a bug in the UI surfaces here
   * rather than silently "working" in demo and failing against real RLS.
   */
  private requireOwnedEvent(
    db: ReturnType<typeof getDb>,
    eventId: string,
  ): EventRecord {
    const event = db.events.find((e) => e.id === eventId)
    if (!event) throw new ServiceError('not_found', 'Event not found.')
    if (!db.currentDjId || event.djId !== db.currentDjId) {
      throw new ServiceError(
        'forbidden',
        'Only the DJ who owns this event can manage it.',
      )
    }
    return event
  }

  private requireGuest(
    db: ReturnType<typeof getDb>,
    eventId: string,
  ): EventGuest {
    const guest = db.guests.find(
      (g) => g.eventId === eventId && g.guestUserId === db.guestUserId,
    )
    if (!guest) {
      throw new ServiceError('forbidden', 'Join the event first.')
    }
    return guest
  }
}

// ---- helpers --------------------------------------------------------------

/** Hand out copies so callers can't mutate the store by reference. */
function clone<T>(value: T): T {
  return structuredClone(value)
}

function hydrateRound(
  round: StoredVotingRound,
  allOptions: VotingOption[],
): VotingRound {
  return clone({
    ...round,
    options: allOptions
      .filter((o) => o.roundId === round.id)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  })
}

function resolveWinner(
  db: ReturnType<typeof getDb>,
  roundId: string,
): string | null {
  const options = db.votingOptions
    .filter((o) => o.roundId === roundId)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  if (options.length === 0) return null

  const counts = options.map((o) => ({
    optionId: o.id,
    votes: db.votingResponses.filter((r) => r.optionId === o.id).length,
  }))

  const max = Math.max(...counts.map((c) => c.votes))
  if (max === 0) return null
  // Ties break by display order, matching the SQL finalisation function.
  return counts.find((c) => c.votes === max)?.optionId ?? null
}

function sortRequests(rows: SongRequest[], sort: RequestSort): SongRequest[] {
  return rows.sort((a, b) => {
    if (sort === 'votes' && b.voteCount !== a.voteCount) {
      return b.voteCount - a.voteCount
    }
    return b.createdAt.localeCompare(a.createdAt)
  })
}

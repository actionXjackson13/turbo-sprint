import type {
  DjSet,
  QueueGroup,
  DjSetSong,
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
  type DjSongInput,
  type DjSetSongInput,
  type SetLoadResult,
  type CreateVotingRoundInput,
  type DataService,
  type EventSettingsPatch,
  type GuestIdentity,
  type Unsubscribe,
} from '../types'
import {
  channels,
  demoDelay,
  getActiveGuestUserId,
  getDb,
  mutate,
  nowIso,
  subscribe,
  type StoredVotingRound,
} from './demoStore'
import { songMatchKey } from '../../utils/normalizeText'
import {
  isAlreadyIn,
  partitionNew,
  playedOrPendingKeys,
} from '../../features/requests/duplicates'
import {
  SIMILAR_REQUEST_THRESHOLD,
  trigramSimilarity,
} from '../../utils/similarity'
import {
  FIELD_LIMITS,
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
/**
 * Sign-in has to match what was typed at sign-up, and people do not type an
 * email the same way twice — a stray capital or a trailing space from a paste
 * would otherwise be a different account.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Supabase Auth's default, mirrored so both backends refuse the same input. */
const MIN_PASSWORD_LENGTH = 6

export class DemoService implements DataService {
  // ---- DJ authentication -------------------------------------------------

  async signUpDj(
    email: string,
    password: string,
    displayName: string,
  ): Promise<Profile> {
    await demoDelay()

    const normalized = normalizeEmail(email)

    return mutate((db) => {
      // Two profiles behind one email is how a DJ ends up signing into an
      // account they did not mean to, which is the failure this whole path
      // exists to avoid.
      if (db.accounts.some((a) => a.email === normalized)) {
        throw new ServiceError(
          'duplicate',
          'There is already an account with that email. Sign in instead.',
        )
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new ServiceError(
          'invalid_input',
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        )
      }

      const profile: Profile = {
        id: `demo-dj-${crypto.randomUUID().slice(0, 8)}`,
        displayName: displayName.trim(),
        createdAt: nowIso(),
      }
      db.profiles.push(profile)
      db.accounts.push({ email: normalized, profileId: profile.id })
      db.currentDjId = profile.id
      return profile
    })
  }

  /**
   * Sign in as whoever owns this email.
   *
   * It used to look up the account by `currentDjId` and fall back to the first
   * profile in the database when that was null — which, after signing out, it
   * always is. So every sign-in landed on the seeded sample DJ regardless of
   * what was typed, and a DJ who had made their own account could never get
   * back into it.
   *
   * The password is checked for length and then ignored. Demo mode stores no
   * password to compare against and deliberately never will (see DemoAccount),
   * so pretending to verify one would be theatre; what matters is that the
   * email decides the account rather than a fallback.
   */
  async signInDj(email: string, password: string): Promise<Profile> {
    await demoDelay()
    const normalized = normalizeEmail(email)

    return mutate((db) => {
      const account = db.accounts.find((a) => a.email === normalized)
      const profile = account
        ? db.profiles.find((p) => p.id === account.profileId)
        : undefined

      if (!profile) {
        throw new ServiceError(
          'unauthorized',
          'No account with that email on this phone. Demo accounts live on the phone that made them — pick yours from the list below.',
        )
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
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
    return { guestUserId: getActiveGuestUserId() }
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
        announcement: null,
        theme: null,
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
        if (patch.theme !== undefined) event.theme = patch.theme
        return clone(event)
      },
      channels.event(eventId),
    )
  }

  async importApplePlaylist(): Promise<never> {
    // Demo mode is this browser and nothing else, and Apple will not let a
    // browser read one of its pages. There is nowhere for the fetch to happen.
    throw new ServiceError(
      'invalid_input',
      'Importing a playlist needs the online backend. It is not available in demo mode.',
    )
  }

  async setNowPlaying(
    eventId: string,
    nowPlaying: {
      title: string
      artist: string
      sourceRequestId: string | null
      artworkUrl?: string | null
    } | null,
  ): Promise<EventRecord> {
    await demoDelay(80)
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, eventId)
        event.nowPlaying = nowPlaying
          ? { ...nowPlaying, artworkUrl: nowPlaying.artworkUrl ?? null }
          : null

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

  async setAnnouncement(
    eventId: string,
    input: { message: string; durationSeconds: number } | null,
  ): Promise<EventRecord> {
    await demoDelay(80)
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, eventId)
        const message = input?.message.trim() ?? ''

        if (!input || !message) {
          event.announcement = null
        } else {
          if (input.durationSeconds <= 0) {
            throw new ServiceError(
              'invalid_input',
              'Choose how long the message should show for.',
            )
          }
          if (message.length > FIELD_LIMITS.announcement) {
            throw new ServiceError('invalid_input', 'That message is too long.')
          }
          event.announcement = {
            message,
            // Mirrors the RPC, which computes the expiry from the server's own
            // clock rather than trusting a caller's.
            expiresAt: new Date(
              Date.now() + input.durationSeconds * 1000,
            ).toISOString(),
          }
        }
        return clone(event)
      },
      channels.event(eventId),
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

  subscribeGuests(eventId: string, onChange: () => void): Unsubscribe {
    return subscribe(channels.guests(eventId), onChange)
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
        const me = getActiveGuestUserId()

        const existing = db.guests.find(
          (g) => g.eventId === event.id && g.guestUserId === me,
        )
        if (existing) {
          // Rejoining updates the name rather than adding a second membership.
          existing.displayName = displayName.trim()
          return { event: clone(event), guest: clone(existing) }
        }

        const guest: EventGuest = {
          id: `demo-guest-row-${crypto.randomUUID().slice(0, 8)}`,
          eventId: event.id,
          guestUserId: me,
          displayName: displayName.trim(),
          isBlocked: false,
          joinedAt: nowIso(),
        }
        db.guests.push(guest)
        return { event: clone(event), guest: clone(guest) }
      },
      channels.event(target.id),
      // A new arrival changes the roster and the guest count with it.
      channels.guests(target.id),
    )
  }

  async getGuestSession(eventId: string): Promise<EventGuest | null> {
    const db = getDb()
    const guest = db.guests.find(
      (g) => g.eventId === eventId && g.guestUserId === getActiveGuestUserId(),
    )
    return guest ? clone(guest) : null
  }

  async getEventGuestCount(eventId: string): Promise<number> {
    return getDb().guests.filter((g) => g.eventId === eventId).length
  }

  async listEventGuests(eventId: string): Promise<EventGuest[]> {
    return getDb()
      .guests.filter((g) => g.eventId === eventId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map(clone)
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
      channels.guests(eventId),
      // Request lists show who asked for what and grey out a blocked guest's
      // rows, so they want to know too.
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
      (g) => g.eventId === eventId && g.guestUserId === getActiveGuestUserId(),
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

    const candidates = getDb().requests.filter(
      (r) =>
        r.eventId === eventId &&
        // A previously declined song shouldn't block a fresh ask.
        r.status !== 'declined',
    )

    // An exact match on the normalised key always wins, regardless of what the
    // fuzzy scores say — mirrors the ordering in find_similar_request (0005).
    const exact = candidates.find((r) => songMatchKey(r.title, r.artist) === key)
    if (exact) return clone(exact)

    // Otherwise the closest request above the threshold, so a typo lands on the
    // song the room already asked for rather than creating a rival entry.
    let best: SongRequest | null = null
    let bestScore = 0
    for (const request of candidates) {
      const score = trigramSimilarity(
        key,
        songMatchKey(request.title, request.artist),
      )
      if (score >= SIMILAR_REQUEST_THRESHOLD && score > bestScore) {
        best = request
        bestScore = score
      }
    }

    return best ? clone(best) : null
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
          (g) =>
            g.eventId === input.eventId &&
            g.guestUserId === getActiveGuestUserId(),
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
          queueGroup: 'main',
          sourceRoundId: null,
          catalogId: input.catalogId ?? null,
          artworkUrl: input.artworkUrl ?? null,
          catalogUrl: input.catalogUrl ?? null,
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

  /**
   * The DJ's own song, straight into the queue.
   *
   * Deliberately not createSongRequest with the DJ standing in for a guest:
   * there is no guest row to attach, no founding vote to cast, and the
   * per-guest request cap and the open/paused/closed gate are both about
   * managing the room rather than the person managing it.
   */
  async addDjSong(input: DjSongInput): Promise<SongRequest> {
    await demoDelay()
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, input.eventId)
        if (event.status === 'ended') {
          throw new ServiceError('forbidden', 'This event has ended.')
        }

        const title = input.title.trim()
        if (!title) {
          throw new ServiceError('invalid_input', 'A song needs a title.')
        }

        // The DJ pressed a button and is owed an answer; "it is already coming
        // up" is a more useful one than a second copy in the queue.
        const already = playedOrPendingKeys(
          db.requests.filter((r) => r.eventId === input.eventId),
        )
        if (isAlreadyIn(already, { title, artist: input.artist })) {
          throw new ServiceError(
            'duplicate',
            'That song is already on tonight.',
          )
        }

        // The back of the queue, like anything else queued.
        const positions = db.requests
          .filter(
            (r) =>
              r.eventId === input.eventId &&
              r.status === 'queued' &&
              r.queuePosition !== null,
          )
          .map((r) => r.queuePosition!)

        const now = nowIso()
        const request: SongRequest = {
          id: `demo-req-${crypto.randomUUID().slice(0, 8)}`,
          eventId: input.eventId,
          guestId: null,
          // Named, so a guest reading the queue can tell the DJ's picks from
          // the room's.
          guestDisplayName:
            db.profiles.find((p) => p.id === event.djId)?.displayName ?? 'DJ',
          title,
          artist: input.artist.trim(),
          voteCount: 0,
          status: 'queued',
          // One song the DJ added by hand is a decision about now, not
          // backdrop — unlike a whole set, which lands in sub.
          queueGroup: 'main',
          queuePosition: positions.length ? Math.max(...positions) + 1 : 0,
          sourceRoundId: null,
          catalogId: input.catalogId ?? null,
          artworkUrl: input.artworkUrl ?? null,
          catalogUrl: input.catalogUrl ?? null,
          createdAt: now,
          updatedAt: now,
        }
        db.requests.push(request)
        return clone(request)
      },
      channels.requests(input.eventId),
    )
  }

  // ---- The DJ's sets -----------------------------------------------------

  async listDjSets(): Promise<DjSet[]> {
    await demoDelay()
    const db = getDb()
    if (!db.currentDjId) return []
    return db.djSets
      .filter((s) => s.djId === db.currentDjId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(clone)
  }

  async getDjSet(setId: string): Promise<DjSet | null> {
    await demoDelay(60)
    const db = getDb()
    const set = db.djSets.find((s) => s.id === setId)
    if (!set || set.djId !== db.currentDjId) return null
    return clone(set)
  }

  async createDjSet(name: string): Promise<DjSet> {
    await demoDelay()
    return mutate((db) => {
      const dj = this.requireDj(db.currentDjId, db.profiles)
      const trimmed = name.trim()
      if (!trimmed) {
        throw new ServiceError('invalid_input', 'Give the set a name.')
      }

      const now = nowIso()
      const set: DjSet = {
        id: `demo-set-${crypto.randomUUID().slice(0, 8)}`,
        djId: dj.id,
        name: trimmed,
        songs: [],
        createdAt: now,
        updatedAt: now,
      }
      db.djSets.push(set)
      return clone(set)
    })
  }

  async renameDjSet(setId: string, name: string): Promise<DjSet> {
    await demoDelay(80)
    return mutate((db) => {
      const set = this.requireOwnedSet(db, setId)
      const trimmed = name.trim()
      if (!trimmed) {
        throw new ServiceError('invalid_input', 'Give the set a name.')
      }
      set.name = trimmed
      set.updatedAt = nowIso()
      return clone(set)
    })
  }

  async deleteDjSet(setId: string): Promise<void> {
    await demoDelay(80)
    mutate((db) => {
      this.requireOwnedSet(db, setId)
      db.djSets = db.djSets.filter((s) => s.id !== setId)
    })
  }

  async addSongToSet(setId: string, song: DjSetSongInput): Promise<DjSet> {
    await demoDelay(80)
    return mutate((db) => {
      const set = this.requireOwnedSet(db, setId)
      const title = song.title.trim()
      if (!title) {
        throw new ServiceError('invalid_input', 'A song needs a title.')
      }

      const entry: DjSetSong = {
        id: `demo-setsong-${crypto.randomUUID().slice(0, 8)}`,
        setId,
        title,
        artist: song.artist.trim(),
        displayOrder: set.songs.length,
        catalogId: song.catalogId ?? null,
        artworkUrl: song.artworkUrl ?? null,
        catalogUrl: song.catalogUrl ?? null,
      }
      set.songs.push(entry)
      set.updatedAt = nowIso()
      return clone(set)
    })
  }

  async removeSongFromSet(setId: string, songId: string): Promise<DjSet> {
    await demoDelay(80)
    return mutate((db) => {
      const set = this.requireOwnedSet(db, setId)
      set.songs = set.songs.filter((s) => s.id !== songId)
      // Renumbered so the order stays dense — a gap would survive into the
      // queue as an ordering nobody asked for.
      set.songs.forEach((s, i) => {
        s.displayOrder = i
      })
      set.updatedAt = nowIso()
      return clone(set)
    })
  }

  async reorderSetSongs(
    setId: string,
    orderedSongIds: string[],
  ): Promise<DjSet> {
    await demoDelay(80)
    return mutate((db) => {
      const set = this.requireOwnedSet(db, setId)
      const byId = new Map(set.songs.map((s) => [s.id, s]))

      // Anything the caller left out keeps its place at the end rather than
      // being dropped: a stale list from another tab should not delete songs.
      const ordered = orderedSongIds
        .map((id) => byId.get(id))
        .filter((s): s is DjSetSong => Boolean(s))
      const missing = set.songs.filter((s) => !orderedSongIds.includes(s.id))

      set.songs = [...ordered, ...missing].map((song, index) => ({
        ...song,
        displayOrder: index,
      }))
      set.updatedAt = nowIso()
      return clone(set)
    })
  }

  async duplicateDjSet(setId: string, name: string): Promise<DjSet> {
    await demoDelay()
    return mutate((db) => {
      const source = this.requireOwnedSet(db, setId)
      const trimmed = name.trim()
      if (!trimmed) {
        throw new ServiceError('invalid_input', 'Give the set a name.')
      }

      const now = nowIso()
      const id = `demo-set-${crypto.randomUUID().slice(0, 8)}`
      const copy: DjSet = {
        id,
        djId: source.djId,
        name: trimmed,
        createdAt: now,
        updatedAt: now,
        // Fresh ids: editing the copy must not reach back into the original.
        songs: source.songs.map((song, index) => ({
          ...song,
          id: `demo-setsong-${crypto.randomUUID().slice(0, 8)}`,
          setId: id,
          displayOrder: index,
        })),
      }
      db.djSets.push(copy)
      return clone(copy)
    })
  }

  /**
   * The whole set into one event's queue, as the DJ's own songs.
   *
   * Copied rather than referenced: a queued song has to stand on its own, so
   * renaming or deleting the set next week cannot disturb a night already
   * played.
   */
  async loadSetIntoQueue(
    eventId: string,
    setId: string,
  ): Promise<SetLoadResult> {
    await demoDelay()
    return mutate(
      (db) => {
        const event = this.requireOwnedEvent(db, eventId)
        if (event.status === 'ended') {
          throw new ServiceError('forbidden', 'This event has ended.')
        }
        const set = this.requireOwnedSet(db, setId)

        const positions = db.requests
          .filter(
            (r) =>
              r.eventId === eventId &&
              r.status === 'queued' &&
              r.queuePosition !== null,
          )
          .map((r) => r.queuePosition!)
        let next = positions.length ? Math.max(...positions) + 1 : 0

        const djName =
          db.profiles.find((p) => p.id === event.djId)?.displayName ?? 'DJ'
        const now = nowIso()

        // Loading the same set twice is a common slip and used to duplicate
        // every track in it. Declined songs are not counted as "already on" —
        // turning a request down is not the same as playing it.
        const { fresh, duplicates } = partitionNew(
          [...set.songs].sort((a, b) => a.displayOrder - b.displayOrder),
          db.requests.filter((r) => r.eventId === eventId),
        )

        for (const song of fresh) {
          db.requests.push({
            id: `demo-req-${crypto.randomUUID().slice(0, 8)}`,
            eventId,
            guestId: null,
            guestDisplayName: djName,
            title: song.title,
            artist: song.artist,
            voteCount: 0,
            status: 'queued',
            // A set is the backdrop; that is what sub means.
            queueGroup: 'sub',
            queuePosition: next,
            sourceRoundId: null,
            catalogId: song.catalogId,
            artworkUrl: song.artworkUrl,
            catalogUrl: song.catalogUrl,
            createdAt: now,
            updatedAt: now,
          })
          next += 1
        }

        return { added: fresh.length, skipped: duplicates.length }
      },
      channels.requests(eventId),
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
    mainCount?: number,
  ): Promise<void> {
    await demoDelay(80)
    mutate(
      (db) => {
        this.requireOwnedEvent(db, eventId)
        orderedRequestIds.forEach((id, index) => {
          const request = db.requests.find(
            (r) => r.id === id && r.eventId === eventId && r.status === 'queued',
          )
          if (!request) return
          request.queuePosition = index
          // Undefined means "leave the halves alone" — a caller that only
          // wanted to reorder within what is already there.
          if (mainCount !== undefined) {
            request.queueGroup = index < mainCount ? 'main' : 'sub'
          }
          request.updatedAt = nowIso()
        })
      },
      channels.requests(eventId),
    )
  }

  async setQueueGroup(
    requestId: string,
    group: QueueGroup,
  ): Promise<SongRequest> {
    await demoDelay(80)
    const eventId = getDb().requests.find((r) => r.id === requestId)?.eventId
    return mutate(
      (db) => {
        const request = db.requests.find((r) => r.id === requestId)
        if (!request) throw new ServiceError('not_found', 'Request not found.')
        this.requireOwnedEvent(db, request.eventId)
        request.queueGroup = group
        request.updatedAt = nowIso()
        return clone(request)
      },
      channels.requests(eventId ?? ''),
    )
  }

  subscribeSongRequests(eventId: string, onChange: () => void): Unsubscribe {
    return subscribe(channels.requests(eventId), onChange)
  }

  // ---- Request voting ----------------------------------------------------

  async getMyRequestVotes(eventId: string): Promise<string[]> {
    const db = getDb()
    const guest = db.guests.find(
      (g) => g.eventId === eventId && g.guestUserId === getActiveGuestUserId(),
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
          // Same code the real backend raises, so the screen can offer the
          // same way out of it in either mode.
          throw new ServiceError(
            'vote_running',
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
            catalogId: opt.catalogId ?? null,
            artworkUrl: opt.artworkUrl ?? null,
            catalogUrl: opt.catalogUrl ?? null,
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
      (g) =>
        g.eventId === round.eventId &&
        g.guestUserId === getActiveGuestUserId(),
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
          queueGroup: 'main',
          queuePosition: positions.length > 0 ? Math.max(...positions) + 1 : 0,
          sourceRoundId: roundId,
          // The winner keeps the identity it was picked with, so the request
          // it becomes looks like any other catalogue-picked one.
          catalogId: option.catalogId,
          artworkUrl: option.artworkUrl,
          catalogUrl: option.catalogUrl,
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
  /** A set belongs to one DJ and is invisible to everyone else. */
  private requireOwnedSet(db: ReturnType<typeof getDb>, setId: string): DjSet {
    const set = db.djSets.find((s) => s.id === setId)
    if (!set) throw new ServiceError('not_found', 'Set not found.')
    if (!db.currentDjId || set.djId !== db.currentDjId) {
      throw new ServiceError('forbidden', 'That set belongs to someone else.')
    }
    return set
  }

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
      (g) => g.eventId === eventId && g.guestUserId === getActiveGuestUserId(),
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

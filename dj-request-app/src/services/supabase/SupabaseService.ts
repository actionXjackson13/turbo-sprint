import type { RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js'
import type {
  DjSet,
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
import {
  ServiceError,
  type CreateRequestInput,
  type DjSongInput,
  type DjSetSongInput,
  type CreateVotingRoundInput,
  type DataService,
  type EventSettingsPatch,
  type GuestIdentity,
  type Unsubscribe,
} from '../types'
import { getSupabaseClient } from './client'
import { translateError } from './errors'
import {
  asRow,
  toEvent,
  toEventGuest,
  toProfile,
  toSongRequest,
  toVotingOption,
  toVotingRound,
  toDjSet,
} from './mappers'
import { normalizeEventCode } from '../../data/eventCodeGenerator'

const EVENT_SELECT = '*, profiles!events_dj_id_fkey(display_name)'

/**
 * Supabase-backed implementation of the data contract.
 *
 * Two things are worth knowing when reading this:
 *
 * 1. Guests authenticate anonymously. `getOrCreateGuestIdentity` establishes a
 *    real Supabase session so every guest action carries a verified
 *    `auth.uid()` that RLS can check. Nothing here trusts a client-supplied id.
 *
 * 2. Anything the client must not be trusted to decide is an RPC, not a table
 *    write — creating requests, joining events, blocking guests, ending and
 *    finalising rounds, promoting winners. The corresponding tables
 *    deliberately have no INSERT/UPDATE policy for those paths.
 */
export class SupabaseService implements DataService {
  private readonly db: SupabaseClient

  constructor(client: SupabaseClient = getSupabaseClient()) {
    this.db = client
  }

  // ---- DJ authentication -------------------------------------------------

  async signUpDj(
    email: string,
    password: string,
    displayName: string,
  ): Promise<Profile> {
    const { data, error } = await this.db.auth.signUp({
      email: email.trim(),
      password,
      // Read by the handle_new_user trigger to seed the profile row.
      options: { data: { display_name: displayName.trim() } },
    })
    if (error) translateError(error, 'Could not create your account.')

    if (!data.user) {
      throw new ServiceError('unknown', 'Could not create your account.')
    }
    if (!data.session) {
      // Email confirmation is enabled on the project.
      throw new ServiceError(
        'unauthorized',
        'Check your email to confirm your account, then sign in.',
      )
    }

    return this.requireProfile(data.user.id)
  }

  async signInDj(email: string, password: string): Promise<Profile> {
    const { data, error } = await this.db.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      throw new ServiceError('unauthorized', 'Incorrect email or password.')
    }
    if (!data.user) {
      throw new ServiceError('unauthorized', 'Incorrect email or password.')
    }
    return this.requireProfile(data.user.id)
  }

  async signOutDj(): Promise<void> {
    const { error } = await this.db.auth.signOut()
    if (error) translateError(error, 'Could not sign out.')
  }

  async getCurrentDjProfile(): Promise<Profile | null> {
    const user = await this.getUser()
    // An anonymous guest session is not a DJ, even though it is a real user.
    if (!user || user.is_anonymous) return null

    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) translateError(error, 'Could not load your profile.')
    return data ? toProfile(data) : null
  }

  onDjAuthStateChange(cb: (profile: Profile | null) => void): Unsubscribe {
    const { data } = this.db.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (!user || user.is_anonymous) {
        cb(null)
        return
      }
      void this.getCurrentDjProfile().then(cb)
    })
    return () => data.subscription.unsubscribe()
  }

  // ---- Guest identity ----------------------------------------------------

  async getOrCreateGuestIdentity(): Promise<GuestIdentity> {
    const existing = await this.getUser()
    if (existing) return { guestUserId: existing.id }

    // No session yet: mint an anonymous one. Supabase persists and refreshes
    // it, which is what makes the guest survive a reload.
    const { data, error } = await this.db.auth.signInAnonymously()
    if (error) translateError(error, 'Could not start a guest session.')
    if (!data.user) {
      throw new ServiceError('unknown', 'Could not start a guest session.')
    }
    return { guestUserId: data.user.id }
  }

  // ---- Events ------------------------------------------------------------

  async createEvent(name: string): Promise<EventRecord> {
    const { data, error } = await this.db
      .rpc('create_event', { p_name: name.trim() })
      .single()
    if (error) translateError(error, 'Could not create the event.')

    const profile = await this.getCurrentDjProfile()
    return toEvent(asRow(data), profile?.displayName)
  }

  async getDjEvents(): Promise<EventRecord[]> {
    const user = await this.getUser()
    if (!user || user.is_anonymous) return []

    const { data, error } = await this.db
      .from('events')
      .select(EVENT_SELECT)
      .eq('dj_id', user.id)
      .order('created_at', { ascending: false })

    if (error) translateError(error, 'Could not load your events.')
    return (data ?? []).map((row) => toEvent(row))
  }

  async getEventById(eventId: string): Promise<EventRecord | null> {
    const { data, error } = await this.db
      .from('events')
      .select(EVENT_SELECT)
      .eq('id', eventId)
      .maybeSingle()

    if (error) translateError(error, 'Could not load the event.')
    return data ? toEvent(data) : null
  }

  async getEventByCode(code: string): Promise<EventRecord | null> {
    const { data, error } = await this.db
      .from('events')
      .select(EVENT_SELECT)
      .eq('code', normalizeEventCode(code))
      .eq('status', 'active')
      .maybeSingle()

    if (error) translateError(error, 'Could not look up that code.')
    return data ? toEvent(data) : null
  }

  async updateEventSettings(
    eventId: string,
    patch: EventSettingsPatch,
  ): Promise<EventRecord> {
    const update: Record<string, unknown> = {}
    if (patch.name !== undefined) update.name = patch.name.trim()
    if (patch.requestStatus !== undefined) {
      update.request_status = patch.requestStatus
    }

    const { data, error } = await this.db
      .from('events')
      .update(update)
      .eq('id', eventId)
      .select(EVENT_SELECT)
      .single()

    if (error) translateError(error, 'Could not update the event.')
    return toEvent(data)
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
    const { error } = await this.db.rpc('set_now_playing', {
      p_event_id: eventId,
      p_title: nowPlaying?.title ?? null,
      p_artist: nowPlaying?.artist ?? null,
      p_request_id: nowPlaying?.sourceRequestId ?? null,
      p_artwork_url: nowPlaying?.artworkUrl ?? null,
    })
    if (error) translateError(error, 'Could not set the current song.')

    const event = await this.getEventById(eventId)
    if (!event) throw new ServiceError('not_found', 'Event not found.')
    return event
  }

  async endEvent(eventId: string): Promise<EventRecord> {
    const { error } = await this.db.rpc('end_event', { p_event_id: eventId })
    if (error) translateError(error, 'Could not end the event.')

    const event = await this.getEventById(eventId)
    if (!event) throw new ServiceError('not_found', 'Event not found.')
    return event
  }

  async setAnnouncement(
    eventId: string,
    input: { message: string; durationSeconds: number } | null,
  ): Promise<EventRecord> {
    const { error } = await this.db.rpc('set_announcement', {
      p_event_id: eventId,
      p_message: input?.message ?? null,
      p_duration_seconds: input?.durationSeconds ?? null,
    })
    if (error) translateError(error, 'Could not send that message.')

    const event = await this.getEventById(eventId)
    if (!event) throw new ServiceError('not_found', 'Event not found.')
    return event
  }

  subscribeEvent(eventId: string, onChange: () => void): Unsubscribe {
    return this.channel(`event:${eventId}`, onChange, (channel) =>
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${eventId}`,
        },
        onChange,
      ),
    )
  }

  // ---- Guest membership --------------------------------------------------

  async joinEvent(
    code: string,
    displayName: string,
  ): Promise<{ event: EventRecord; guest: EventGuest }> {
    // Guests must have a verified identity before the RPC can attribute the
    // membership row to them.
    await this.getOrCreateGuestIdentity()

    const { data, error } = await this.db
      .rpc('join_event', {
        p_code: normalizeEventCode(code),
        p_display_name: displayName.trim(),
      })
      .single()

    if (error) translateError(error, 'Could not join that event.')

    const guest = toEventGuest(asRow(data))
    const event = await this.getEventById(guest.eventId)
    if (!event) throw new ServiceError('not_found', 'Event not found.')
    return { event, guest }
  }

  async getGuestSession(eventId: string): Promise<EventGuest | null> {
    const user = await this.getUser()
    if (!user) return null

    const { data, error } = await this.db
      .from('event_guests')
      .select('*')
      .eq('event_id', eventId)
      .eq('guest_user_id', user.id)
      .maybeSingle()

    if (error) translateError(error, 'Could not load your session.')
    return data ? toEventGuest(data) : null
  }

  async getEventGuestCount(eventId: string): Promise<number> {
    const { count, error } = await this.db
      .from('event_guests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)

    if (error) translateError(error, 'Could not count guests.')
    return count ?? 0
  }

  async listEventGuests(eventId: string): Promise<EventGuest[]> {
    // RLS decides what comes back: the owning DJ sees every guest, a guest
    // sees only themselves. No extra filtering is needed here.
    const { data, error } = await this.db
      .from('event_guests')
      .select('*')
      .eq('event_id', eventId)
      .order('joined_at', { ascending: true })

    if (error) translateError(error, 'Could not load the guest list.')
    return (data ?? []).map(toEventGuest)
  }

  async setGuestBlocked(
    eventId: string,
    guestId: string,
    blocked: boolean,
  ): Promise<void> {
    const { error } = await this.db.rpc('set_guest_blocked', {
      p_event_id: eventId,
      p_guest_id: guestId,
      p_blocked: blocked,
    })
    if (error) translateError(error, 'Could not update that guest.')
  }

  // ---- Song requests -----------------------------------------------------

  async listSongRequests(
    eventId: string,
    opts?: { sort?: RequestSort; statuses?: RequestStatus[] },
  ): Promise<SongRequest[]> {
    let query = this.db.from('song_requests').select('*').eq('event_id', eventId)

    if (opts?.statuses?.length) {
      query = query.in('status', opts.statuses)
    }

    query =
      opts?.sort === 'votes'
        ? query
            .order('vote_count', { ascending: false })
            .order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) translateError(error, 'Could not load requests.')
    return (data ?? []).map(toSongRequest)
  }

  async getSongRequest(requestId: string): Promise<SongRequest | null> {
    const { data, error } = await this.db
      .from('song_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (error) translateError(error, 'Could not load that request.')
    return data ? toSongRequest(data) : null
  }

  async getMyRequests(eventId: string): Promise<SongRequest[]> {
    const guest = await this.getGuestSession(eventId)
    if (!guest) return []

    const { data, error } = await this.db
      .from('song_requests')
      .select('*')
      .eq('event_id', eventId)
      .eq('guest_id', guest.id)
      .order('created_at', { ascending: false })

    if (error) translateError(error, 'Could not load your requests.')
    return (data ?? []).map(toSongRequest)
  }

  async findSimilarRequest(
    eventId: string,
    title: string,
    artist: string,
  ): Promise<SongRequest | null> {
    // Matching runs in the database: it owns the normalisation applied on
    // insert, and the trigram scoring that catches typos. Doing it here would
    // mean pulling every request down and re-deriving both.
    const { data, error } = await this.db
      .rpc('find_similar_request', {
        p_event_id: eventId,
        p_title: title,
        p_artist: artist,
      })
      .maybeSingle()

    if (error) translateError(error, 'Could not check for duplicates.')
    return data ? toSongRequest(asRow(data)) : null
  }

  async createSongRequest(input: CreateRequestInput): Promise<SongRequest> {
    const { data, error } = await this.db
      .rpc('create_song_request', {
        p_event_id: input.eventId,
        p_title: input.title.trim(),
        p_artist: input.artist.trim(),
        p_catalog_id: input.catalogId ?? null,
        p_artwork_url: input.artworkUrl ?? null,
        p_catalog_url: input.catalogUrl ?? null,
      })
      .single()

    if (error) translateError(error, 'Could not send your request.')
    return toSongRequest(asRow(data))
  }

  /**
   * The DJ's own song, straight into the queue.
   *
   * An RPC rather than a plain insert: guest_id must be null and the status
   * must be 'queued' from the outset, and the row-level policy that lets a
   * guest insert their own request is deliberately not wide enough to allow
   * either. Ownership is checked server-side, as it is for every DJ action.
   */
  async addDjSong(input: DjSongInput): Promise<SongRequest> {
    const { data, error } = await this.db
      .rpc('add_dj_song', {
        p_event_id: input.eventId,
        p_title: input.title.trim(),
        p_artist: input.artist.trim(),
        p_catalog_id: input.catalogId ?? null,
        p_artwork_url: input.artworkUrl ?? null,
        p_catalog_url: input.catalogUrl ?? null,
      })
      .single()

    if (error) translateError(error, 'Could not add that song.')
    return toSongRequest(asRow(data))
  }

  // ---- The DJ's sets -----------------------------------------------------

  /**
   * Sets and their songs are plain tables behind RLS rather than RPCs: a set is
   * private to its DJ, and "rows where dj_id = auth.uid()" is exactly what a
   * policy expresses best. Only loading one into a queue needs a function,
   * because that writes to song_requests in a shape the guest-facing insert
   * policy deliberately forbids.
   */
  async listDjSets(): Promise<DjSet[]> {
    const { data, error } = await this.db
      .from('dj_sets')
      .select('*, dj_set_songs(*)')
      .order('name')

    if (error) translateError(error, 'Could not load your sets.')
    return (data ?? []).map(toDjSet)
  }

  async getDjSet(setId: string): Promise<DjSet | null> {
    const { data, error } = await this.db
      .from('dj_sets')
      .select('*, dj_set_songs(*)')
      .eq('id', setId)
      .maybeSingle()

    if (error) translateError(error, 'Could not load that set.')
    return data ? toDjSet(data) : null
  }

  async createDjSet(name: string): Promise<DjSet> {
    const djId = (await this.getCurrentDjProfile())?.id
    if (!djId) {
      throw new ServiceError('unauthorized', 'Sign in to make a set.')
    }

    const { data, error } = await this.db
      .from('dj_sets')
      .insert({ dj_id: djId, name: name.trim() })
      .select('*, dj_set_songs(*)')
      .single()

    if (error) translateError(error, 'Could not make that set.')
    return toDjSet(data)
  }

  async renameDjSet(setId: string, name: string): Promise<DjSet> {
    const { data, error } = await this.db
      .from('dj_sets')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', setId)
      .select('*, dj_set_songs(*)')
      .single()

    if (error) translateError(error, 'Could not rename that set.')
    return toDjSet(data)
  }

  async deleteDjSet(setId: string): Promise<void> {
    const { error } = await this.db.from('dj_sets').delete().eq('id', setId)
    if (error) translateError(error, 'Could not delete that set.')
  }

  async addSongToSet(setId: string, song: DjSetSongInput): Promise<DjSet> {
    // Appended, so the order the DJ built is the order it plays in.
    const { count, error: countError } = await this.db
      .from('dj_set_songs')
      .select('id', { count: 'exact', head: true })
      .eq('set_id', setId)

    if (countError) translateError(countError, 'Could not add that song.')

    const { error } = await this.db.from('dj_set_songs').insert({
      set_id: setId,
      title: song.title.trim(),
      artist: song.artist.trim(),
      display_order: count ?? 0,
      catalog_id: song.catalogId ?? null,
      artwork_url: song.artworkUrl ?? null,
      catalog_url: song.catalogUrl ?? null,
    })

    if (error) translateError(error, 'Could not add that song.')
    return this.requireSet(setId)
  }

  async removeSongFromSet(setId: string, songId: string): Promise<DjSet> {
    const { error } = await this.db
      .from('dj_set_songs')
      .delete()
      .eq('id', songId)
      .eq('set_id', setId)

    if (error) translateError(error, 'Could not remove that song.')
    return this.requireSet(setId)
  }

  async loadSetIntoQueue(eventId: string, setId: string): Promise<number> {
    const { data, error } = await this.db.rpc('load_set_into_queue', {
      p_event_id: eventId,
      p_set_id: setId,
    })

    if (error) translateError(error, 'Could not load that set into the queue.')
    return typeof data === 'number' ? data : 0
  }

  /** Re-read after a write, so callers always get the whole set back. */
  private async requireSet(setId: string): Promise<DjSet> {
    const set = await this.getDjSet(setId)
    if (!set) throw new ServiceError('not_found', 'Set not found.')
    return set
  }

  async updateRequestStatus(
    requestId: string,
    status: RequestStatus,
  ): Promise<SongRequest> {
    const { data, error } = await this.db
      .from('song_requests')
      .update({ status })
      .eq('id', requestId)
      .select('*')
      .single()

    if (error) translateError(error, 'Could not update that request.')
    return toSongRequest(data)
  }

  async deleteRequest(requestId: string): Promise<void> {
    const { error } = await this.db
      .from('song_requests')
      .delete()
      .eq('id', requestId)

    if (error) translateError(error, 'Could not remove that request.')
  }

  async reorderQueue(
    eventId: string,
    orderedRequestIds: string[],
  ): Promise<void> {
    const { error } = await this.db.rpc('reorder_queue', {
      p_event_id: eventId,
      p_request_ids: orderedRequestIds,
    })
    if (error) translateError(error, 'Could not reorder the queue.')
  }

  subscribeSongRequests(eventId: string, onChange: () => void): Unsubscribe {
    // Vote changes reach us through this same table: the vote-count trigger
    // updates song_requests, which emits an UPDATE here.
    return this.channel(`requests:${eventId}`, onChange, (channel) =>
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'song_requests',
          filter: `event_id=eq.${eventId}`,
        },
        onChange,
      ),
    )
  }

  // ---- Request voting ----------------------------------------------------

  async getMyRequestVotes(eventId: string): Promise<string[]> {
    const guest = await this.getGuestSession(eventId)
    if (!guest) return []

    const { data, error } = await this.db
      .from('request_votes')
      .select('request_id, song_requests!inner(event_id)')
      .eq('guest_id', guest.id)
      .eq('song_requests.event_id', eventId)

    if (error) translateError(error, 'Could not load your votes.')
    return (data ?? []).map((row) => (row as { request_id: string }).request_id)
  }

  async voteRequest(requestId: string): Promise<void> {
    const request = await this.getSongRequest(requestId)
    if (!request) throw new ServiceError('not_found', 'Request not found.')

    const guest = await this.getGuestSession(request.eventId)
    if (!guest) throw new ServiceError('forbidden', 'Join the event first.')

    const { error } = await this.db
      .from('request_votes')
      .insert({ request_id: requestId, guest_id: guest.id })

    // The unique constraint firing means the vote already exists; treat that
    // as success so optimistic UI and realtime updates cannot fight.
    if (error && (error as { code?: string }).code !== '23505') {
      translateError(error, 'Could not register your vote.')
    }
  }

  async removeRequestVote(requestId: string): Promise<void> {
    const request = await this.getSongRequest(requestId)
    if (!request) throw new ServiceError('not_found', 'Request not found.')

    const guest = await this.getGuestSession(request.eventId)
    if (!guest) throw new ServiceError('forbidden', 'Join the event first.')

    // The delete policy excludes founding votes, so this affects zero rows for
    // the submitter's own request. Check first to give a clear message.
    const { data: existing } = await this.db
      .from('request_votes')
      .select('is_founding_vote')
      .eq('request_id', requestId)
      .eq('guest_id', guest.id)
      .maybeSingle()

    if (existing?.is_founding_vote) {
      throw new ServiceError(
        'forbidden',
        'You cannot remove your vote from your own request.',
      )
    }

    const { error } = await this.db
      .from('request_votes')
      .delete()
      .eq('request_id', requestId)
      .eq('guest_id', guest.id)

    if (error) translateError(error, 'Could not remove your vote.')
  }

  // ---- Voting rounds -----------------------------------------------------

  async createVotingRound(input: CreateVotingRoundInput): Promise<VotingRound> {
    const { data, error } = await this.db.rpc('create_voting_round', {
      p_event_id: input.eventId,
      p_options: input.options.map((o) => ({
        title: o.title.trim(),
        artist: o.artist.trim(),
      })),
      p_duration_seconds: input.durationSeconds,
    })

    if (error) translateError(error, 'Could not start the vote.')

    const round = await this.loadRound(data as string)
    if (!round) throw new ServiceError('unknown', 'Could not start the vote.')
    return round
  }

  async getActiveVotingRound(eventId: string): Promise<VotingRound | null> {
    const { data, error } = await this.db
      .from('voting_rounds')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) translateError(error, 'Could not load the vote.')
    if (!data) return null
    return toVotingRound(data, await this.loadOptions(data.id))
  }

  async getLatestVotingRound(eventId: string): Promise<VotingRound | null> {
    const { data, error } = await this.db
      .from('voting_rounds')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) translateError(error, 'Could not load the vote.')
    if (!data) return null
    return toVotingRound(data, await this.loadOptions(data.id))
  }

  async getVotingRoundResults(roundId: string): Promise<VotingRoundResults> {
    const round = await this.loadRound(roundId)
    if (!round) throw new ServiceError('not_found', 'Vote not found.')

    // Totals come from the aggregate view, never from counting rows here.
    const { data: tallyRows, error: tallyError } = await this.db
      .from('voting_round_tallies')
      .select('option_id, votes')
      .eq('round_id', roundId)

    if (tallyError) translateError(tallyError, 'Could not load vote totals.')

    const tallies = (tallyRows ?? []).map((row) => ({
      optionId: (row as { option_id: string }).option_id,
      votes: (row as { votes: number }).votes,
    }))

    const guest = await this.getGuestSession(round.eventId)
    let myOptionId: string | null = null
    if (guest) {
      const { data: mine } = await this.db
        .from('voting_responses')
        .select('option_id')
        .eq('round_id', roundId)
        .eq('guest_id', guest.id)
        .maybeSingle()
      myOptionId = mine?.option_id ?? null
    }

    return {
      round,
      tallies,
      totalVotes: tallies.reduce((sum, t) => sum + t.votes, 0),
      myOptionId,
    }
  }

  async castRoundVote(roundId: string, optionId: string): Promise<void> {
    const round = await this.loadRound(roundId)
    if (!round) throw new ServiceError('not_found', 'Vote not found.')

    const guest = await this.getGuestSession(round.eventId)
    if (!guest) throw new ServiceError('forbidden', 'Join the event first.')

    // Upsert on (round_id, guest_id): changing a vote moves the existing row
    // rather than adding a second one.
    const { error } = await this.db.from('voting_responses').upsert(
      {
        round_id: roundId,
        option_id: optionId,
        guest_id: guest.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'round_id,guest_id' },
    )

    if (error) {
      // The policy's deadline check refuses the write once a round is over.
      if ((error as { code?: string }).code === '42501') {
        throw new ServiceError('round_closed', 'This vote has ended.')
      }
      translateError(error, 'Could not register your vote.')
    }
  }

  async endVotingRound(roundId: string): Promise<VotingRound> {
    const { error } = await this.db.rpc('end_voting_round', {
      p_round_id: roundId,
    })
    if (error) translateError(error, 'Could not end the vote.')

    const round = await this.loadRound(roundId)
    if (!round) throw new ServiceError('not_found', 'Vote not found.')
    return round
  }

  async cancelVotingRound(roundId: string): Promise<VotingRound> {
    const { error } = await this.db
      .from('voting_rounds')
      .update({
        status: 'cancelled',
        ended_at: new Date().toISOString(),
        winner_option_id: null,
      })
      .eq('id', roundId)

    if (error) translateError(error, 'Could not cancel the vote.')

    const round = await this.loadRound(roundId)
    if (!round) throw new ServiceError('not_found', 'Vote not found.')
    return round
  }

  async finalizeVotingRoundIfExpired(
    roundId: string,
  ): Promise<VotingRound | null> {
    const { error } = await this.db.rpc('finalize_voting_round_if_expired', {
      p_round_id: roundId,
    })
    // Losing the race to another client is not an error worth surfacing.
    if (error) return null
    return this.loadRound(roundId)
  }

  async pushWinnerToQueue(
    roundId: string,
    optionId: string,
  ): Promise<SongRequest> {
    const { data, error } = await this.db
      .rpc('push_winner_to_queue', {
        p_round_id: roundId,
        p_option_id: optionId,
      })
      .single()

    if (error) translateError(error, 'Could not add that song to the queue.')
    return toSongRequest(asRow(data))
  }

  subscribeVotingRounds(eventId: string, onChange: () => void): Unsubscribe {
    return this.channel(`rounds:${eventId}`, onChange, (channel) =>
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'voting_rounds',
            filter: `event_id=eq.${eventId}`,
          },
          onChange,
        )
        // Responses and options carry no event_id, so these are unfiltered.
        // RLS still limits delivery to rows this client may read, and the
        // handler simply re-reads the current round.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'voting_responses' },
          onChange,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'voting_options' },
          onChange,
        ),
    )
  }

  // ---- internals ---------------------------------------------------------

  private async getUser(): Promise<User | null> {
    const { data } = await this.db.auth.getSession()
    return data.session?.user ?? null
  }

  private async requireProfile(userId: string): Promise<Profile> {
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) translateError(error, 'Could not load your profile.')
    if (!data) {
      throw new ServiceError('unknown', 'Your DJ profile could not be loaded.')
    }
    return toProfile(data)
  }

  private async loadOptions(roundId: string): Promise<VotingOption[]> {
    const { data, error } = await this.db
      .from('voting_options')
      .select('*')
      .eq('round_id', roundId)
      .order('display_order', { ascending: true })

    if (error) translateError(error, 'Could not load the vote options.')
    return (data ?? []).map(toVotingOption)
  }

  private async loadRound(roundId: string): Promise<VotingRound | null> {
    const { data, error } = await this.db
      .from('voting_rounds')
      .select('*')
      .eq('id', roundId)
      .maybeSingle()

    if (error) translateError(error, 'Could not load the vote.')
    if (!data) return null
    return toVotingRound(data, await this.loadOptions(data.id))
  }

  /**
   * Builds a realtime channel and returns its teardown.
   *
   * The reconnect handling matters on phones: when a device wakes or changes
   * network, the socket drops and Supabase resubscribes. Any change that
   * happened while disconnected was missed, so a successful (re)subscribe
   * triggers a reload rather than assuming the cached view is still correct.
   */
  private channel(
    name: string,
    onChange: () => void,
    configure: (channel: RealtimeChannel) => RealtimeChannel,
  ): Unsubscribe {
    const channel = configure(this.db.channel(name))

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange()
    })

    return () => {
      void this.db.removeChannel(channel)
    }
  }
}

import type {
  DjSet,
  DjSetSong,
  EventGuest,
  EventRecord,
  Profile,
  SongRequest,
  VotingOption,
  VotingRound,
} from '../../types/domain'

/**
 * Row-to-domain mapping. Kept in one place so the snake_case/camelCase seam
 * exists exactly once, and so the rest of the app never sees database shapes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>

/**
 * Narrows a PostgREST/RPC payload, which is typed `unknown` because the schema
 * is not generated. Mapping functions below are the only consumers, so the
 * cast is contained to this seam.
 */
export function asRow(value: unknown): Row {
  return value as Row
}

export function toProfile(row: Row): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
  }
}

export function toEvent(row: Row, djDisplayName?: string): EventRecord {
  return {
    id: row.id,
    djId: row.dj_id,
    // The join is only present on queries that ask for it; fall back rather
    // than rendering "undefined" next to the event name.
    djDisplayName:
      djDisplayName ?? row.profiles?.display_name ?? 'The DJ',
    name: row.name,
    code: row.code,
    status: row.status,
    requestStatus: row.request_status,
    nowPlaying: row.now_playing_title
      ? {
          title: row.now_playing_title,
          artist: row.now_playing_artist ?? '',
          sourceRequestId: row.now_playing_request_id ?? null,
          artworkUrl: row.now_playing_artwork_url ?? null,
        }
      : null,
    announcement: row.announcement_text
      ? {
          message: row.announcement_text,
          expiresAt: row.announcement_expires_at ?? '',
        }
      : null,
    // Both halves or neither — a row with one colour set is not a theme.
    theme:
      row.theme_primary && row.theme_accent
        ? { primary: row.theme_primary, accent: row.theme_accent }
        : null,
    createdAt: row.created_at,
    endedAt: row.ended_at ?? null,
  }
}

export function toEventGuest(row: Row): EventGuest {
  return {
    id: row.id,
    eventId: row.event_id,
    guestUserId: row.guest_user_id,
    displayName: row.display_name,
    isBlocked: row.is_blocked,
    joinedAt: row.joined_at,
  }
}

export function toSongRequest(row: Row): SongRequest {
  return {
    id: row.id,
    eventId: row.event_id,
    guestId: row.guest_id ?? null,
    guestDisplayName: row.guest_display_name,
    title: row.title,
    artist: row.artist,
    voteCount: row.vote_count ?? 0,
    status: row.status,
    queuePosition: row.queue_position ?? null,
    // Rows written before the queue had halves come back without one.
    queueGroup: row.queue_group === 'sub' ? 'sub' : 'main',
    sourceRoundId: row.source_round_id ?? null,
    catalogId: row.catalog_id ?? null,
    artworkUrl: row.artwork_url ?? null,
    catalogUrl: row.catalog_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toVotingOption(row: Row): VotingOption {
  return {
    id: row.id,
    roundId: row.round_id,
    title: row.title,
    artist: row.artist,
    displayOrder: row.display_order,
    catalogId: row.catalog_id ?? null,
    artworkUrl: row.artwork_url ?? null,
    catalogUrl: row.catalog_url ?? null,
  }
}

export function toVotingRound(row: Row, options: VotingOption[]): VotingRound {
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    durationSeconds: row.duration_seconds ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? null,
    winnerOptionId: row.winner_option_id ?? null,
    endedAt: row.ended_at ?? null,
    createdAt: row.created_at,
    options: [...options].sort((a, b) => a.displayOrder - b.displayOrder),
  }
}

/**
 * A set with its songs, from the joined select.
 *
 * Postgres has no ordering guarantee on an embedded relation, so the songs are
 * sorted here rather than trusted — a set whose order shuffled between reads
 * would load into the queue differently every time.
 */
export function toDjSet(row: Row): DjSet {
  const songs: Row[] = row.dj_set_songs ?? []
  return {
    id: row.id,
    djId: row.dj_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    songs: songs
      .map(toDjSetSong)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }
}

export function toDjSetSong(row: Row): DjSetSong {
  return {
    id: row.id,
    setId: row.set_id,
    title: row.title,
    artist: row.artist ?? '',
    displayOrder: row.display_order ?? 0,
    catalogId: row.catalog_id ?? null,
    artworkUrl: row.artwork_url ?? null,
    catalogUrl: row.catalog_url ?? null,
  }
}

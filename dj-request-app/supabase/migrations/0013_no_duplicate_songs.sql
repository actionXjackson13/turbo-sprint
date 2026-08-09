-- ============================================================================
-- 0013 — a song goes on once
--
-- A guest asking for something already asked for is caught where they ask:
-- find_similar_request offers them the existing entry to upvote instead. The
-- DJ's own path had no equivalent, and the commonest gesture makes it obvious
-- — load a set, realise you meant a different one, load that, then load the
-- first again later in the night, and every track it holds is queued twice.
--
-- Exact normalised matches only. The guest check is fuzzy because a guest is
-- typing from memory and a near-miss is probably the same song; a set's songs
-- came from a catalogue, so a near-miss there is far more likely to be a
-- genuinely different recording — a remix, a live cut — and silently dropping
-- one of those would be worse than the duplicate it prevented.
--
-- Declined songs do not count. Turning one down is not the same as playing it,
-- and a DJ who declined a request should still be able to put it on themselves.
-- ============================================================================

drop function if exists public.load_set_into_queue(uuid, uuid);

create or replace function public.load_set_into_queue(
  p_event_id uuid,
  p_set_id   uuid
)
returns table (added integer, skipped integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event   public.events;
  v_dj_name text;
  v_total   integer := 0;
  v_added   integer := 0;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'not_found: event does not exist' using errcode = 'no_data_found';
  end if;

  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can do this'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.owns_dj_set(p_set_id) then
    raise exception 'forbidden: that set belongs to someone else'
      using errcode = 'insufficient_privilege';
  end if;

  if v_event.status <> 'active' then
    raise exception 'invalid_input: this event has ended'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_total
  from public.dj_set_songs where set_id = p_set_id;

  select display_name into v_dj_name
  from public.profiles where id = v_event.dj_id;

  insert into public.song_requests
    (event_id, guest_id, guest_display_name, title, artist, status, queue_group,
     catalog_id, artwork_url, catalog_url)
  select
    p_event_id,
    null,
    coalesce(nullif(btrim(v_dj_name), ''), 'DJ'),
    s.title,
    s.artist,
    'queued',
    'sub',
    s.catalog_id,
    s.artwork_url,
    s.catalog_url
  from public.dj_set_songs s
  where s.set_id = p_set_id
    -- Not already on tonight, under the same normalisation the duplicate
    -- nudge uses, so the two agree about what counts as the same song.
    and not exists (
      select 1 from public.song_requests r
      where r.event_id = p_event_id
        and r.status <> 'declined'
        and public.normalize_song_text(r.title) =
            public.normalize_song_text(s.title)
        and public.normalize_song_text(r.artist) =
            public.normalize_song_text(s.artist)
    )
  order by s.display_order, s.created_at;

  get diagnostics v_added = row_count;

  added   := v_added;
  skipped := v_total - v_added;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_dj_song — refuses a song the night already has.
--
-- An error rather than a silent no-op: the DJ pressed a button and is owed an
-- answer, and "it is already coming up" is a useful one.
-- ---------------------------------------------------------------------------
create or replace function public.add_dj_song(
  p_event_id    uuid,
  p_title       text,
  p_artist      text,
  p_catalog_id  text default null,
  p_artwork_url text default null,
  p_catalog_url text default null
)
returns public.song_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event   public.events;
  v_dj_name text;
  v_request public.song_requests;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'not_found: event does not exist' using errcode = 'no_data_found';
  end if;

  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can do this'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'invalid_input: a song needs a title'
      using errcode = 'check_violation';
  end if;

  if v_event.status <> 'active' then
    raise exception 'invalid_input: this event has ended'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.song_requests r
    where r.event_id = p_event_id
      and r.status <> 'declined'
      and public.normalize_song_text(r.title) =
          public.normalize_song_text(p_title)
      and public.normalize_song_text(r.artist) =
          public.normalize_song_text(coalesce(p_artist, ''))
  ) then
    raise exception 'duplicate: that song is already on tonight'
      using errcode = 'unique_violation';
  end if;

  select display_name into v_dj_name
  from public.profiles where id = v_event.dj_id;

  insert into public.song_requests
    (event_id, guest_id, guest_display_name, title, artist, status, queue_group,
     catalog_id, artwork_url, catalog_url)
  values
    (p_event_id, null,
     coalesce(nullif(btrim(v_dj_name), ''), 'DJ'),
     btrim(p_title),
     coalesce(btrim(p_artist), ''),
     'queued',
     'main',
     p_catalog_id, p_artwork_url, p_catalog_url)
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.load_set_into_queue(uuid, uuid) to authenticated;

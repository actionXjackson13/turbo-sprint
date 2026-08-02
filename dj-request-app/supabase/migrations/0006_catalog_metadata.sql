-- ============================================================================
-- 0006_catalog_metadata.sql — remember which catalogue song a request is.
--
-- Guests now pick songs from Apple's public catalogue rather than typing a
-- title and artist, so a request can carry the track's identity, its artwork,
-- and a link that opens it in Apple Music.
--
-- Every column is nullable and every one defaults to null:
--   * requests made before this migration have no catalogue entry;
--   * a voting-round winner is typed by the DJ, not picked from search;
--   * a guest may still type a song the catalogue does not have.
-- Nothing downstream may assume these are present.
--
-- The columns are written only by create_song_request, which the client
-- reaches through an RPC — guests have no INSERT privilege on song_requests,
-- so this adds no new write surface. They are plain metadata: nothing is
-- trusted, joined on, or used for authorisation.
-- ============================================================================

alter table public.song_requests
  add column if not exists catalog_id  text,
  add column if not exists artwork_url text,
  add column if not exists catalog_url text;

comment on column public.song_requests.catalog_id is
  'Apple catalogue track id, when the guest picked the song from search.';
comment on column public.song_requests.artwork_url is
  'Album artwork for the picked track.';
comment on column public.song_requests.catalog_url is
  'Opens the track in Apple Music.';

-- Finding every request for one song, for a future "already queued" check.
create index if not exists song_requests_catalog_idx
  on public.song_requests (event_id, catalog_id)
  where catalog_id is not null;

-- ---------------------------------------------------------------------------
-- create_song_request — unchanged except that it now carries the catalogue
-- fields through.
--
-- The three new parameters default to null so that a client built against the
-- previous signature keeps working: a deployed PWA can be a version behind the
-- database, and a released app should never break because the schema moved
-- ahead of it.
--
-- The old signature has to be dropped first. `create or replace` only replaces
-- a function with the *same* argument list — adding parameters creates an
-- overload instead, and a three-argument call then matches both the old
-- function and the new one's defaults, failing with "is not unique".
-- ---------------------------------------------------------------------------
drop function if exists public.create_song_request(uuid, text, text);

create or replace function public.create_song_request(
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
  v_guest   public.event_guests;
  v_event   public.events;
  v_request public.song_requests;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'not_found: event does not exist' using errcode = 'no_data_found';
  end if;
  if v_event.status <> 'active' then
    raise exception 'forbidden: this event has ended' using errcode = 'check_violation';
  end if;
  if v_event.request_status <> 'open' then
    raise exception 'requests_closed: the DJ is not taking requests right now'
      using errcode = 'check_violation';
  end if;

  select * into v_guest
  from public.event_guests
  where event_id = p_event_id and guest_user_id = auth.uid();

  if not found then
    raise exception 'forbidden: join the event before requesting'
      using errcode = 'insufficient_privilege';
  end if;
  if v_guest.is_blocked then
    raise exception 'blocked: the DJ has blocked you from requesting at this event'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.song_requests
    (event_id, guest_id, guest_display_name, title, artist,
     catalog_id, artwork_url, catalog_url)
  values
    (p_event_id, v_guest.id, v_guest.display_name, trim(p_title), trim(p_artist),
     nullif(trim(coalesce(p_catalog_id, '')), ''),
     nullif(trim(coalesce(p_artwork_url, '')), ''),
     nullif(trim(coalesce(p_catalog_url, '')), ''))
  returning * into v_request;

  -- The submitter's vote. Only this function can set is_founding_vote.
  insert into public.request_votes (request_id, guest_id, is_founding_vote)
  values (v_request.id, v_guest.id, true);

  -- Re-read so the returned row carries the trigger-updated vote_count.
  select * into v_request from public.song_requests where id = v_request.id;
  return v_request;
end;
$$;

-- Dropping the function dropped its grant with it.
grant execute on function public.create_song_request(
  uuid, text, text, text, text, text
) to authenticated;

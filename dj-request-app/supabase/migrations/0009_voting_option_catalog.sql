-- ============================================================================
-- 0009_voting_option_catalog.sql — vote options come from the catalogue too.
--
-- The DJ's vote builder was the last place in the app still asking someone to
-- type a title and an artist — the exact problem search was introduced to
-- solve, left standing on the one screen guests never see. Now that a DJ picks
-- options the same way a guest picks a request, those options can carry the
-- track they were picked from.
--
-- Which closes a gap that was visible rather than theoretical: every other
-- list in the app shows cover art, and the voting screen could not, because
-- there was nothing to show. Guests were choosing between rows of bare text on
-- the one screen whose entire job is choosing.
--
-- The winner carries it onward. push_winner_to_queue builds a real request out
-- of the chosen option, and that request should look like any other
-- catalogue-picked one rather than a stranger in the queue.
--
-- All three columns are nullable and stay that way: a DJ can still type an
-- option in, and rounds created before this have none. Nothing may assume they
-- are present.
-- ============================================================================

alter table public.voting_options
  add column if not exists catalog_id  text,
  add column if not exists artwork_url text,
  add column if not exists catalog_url text;

-- ---------------------------------------------------------------------------
-- create_voting_round — now reads the catalogue fields out of each option.
--
-- Unchanged signature, so nothing calling it needs to know: options that
-- carry no catalogue data simply store nulls, exactly as they did before.
-- ---------------------------------------------------------------------------
create or replace function public.create_voting_round(
  p_event_id         uuid,
  p_options          jsonb,
  p_duration_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round_id uuid;
  v_count    integer := jsonb_array_length(p_options);
  v_option   jsonb;
  v_index    integer := 0;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can start a vote'
      using errcode = 'insufficient_privilege';
  end if;

  if v_count is null or v_count < 2 or v_count > 4 then
    raise exception 'invalid_input: a vote needs between 2 and 4 songs'
      using errcode = 'check_violation';
  end if;

  insert into public.voting_rounds (event_id, duration_seconds, ends_at)
  values (
    p_event_id,
    p_duration_seconds,
    case when p_duration_seconds is null
         then null
         else now() + make_interval(secs => p_duration_seconds)
    end
  )
  returning id into v_round_id;

  for v_option in select * from jsonb_array_elements(p_options) loop
    insert into public.voting_options
      (round_id, title, artist, display_order,
       catalog_id, artwork_url, catalog_url)
    values (
      v_round_id,
      trim(v_option ->> 'title'),
      trim(v_option ->> 'artist'),
      v_index,
      nullif(v_option ->> 'catalogId', ''),
      nullif(v_option ->> 'artworkUrl', ''),
      nullif(v_option ->> 'catalogUrl', '')
    );
    v_index := v_index + 1;
  end loop;

  return v_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- push_winner_to_queue — the winning song keeps its identity.
-- ---------------------------------------------------------------------------
create or replace function public.push_winner_to_queue(
  p_round_id  uuid,
  p_option_id uuid
)
returns public.song_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round   public.voting_rounds;
  v_option  public.voting_options;
  v_request public.song_requests;
begin
  select * into v_round from public.voting_rounds where id = p_round_id;
  if not found then
    raise exception 'not_found: vote does not exist' using errcode = 'no_data_found';
  end if;

  if not public.is_event_owner(v_round.event_id) then
    raise exception 'forbidden: only the event owner can do this'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_option
  from public.voting_options
  where id = p_option_id and round_id = p_round_id;
  if not found then
    raise exception 'not_found: song is not part of this vote'
      using errcode = 'no_data_found';
  end if;

  insert into public.song_requests
    (event_id, guest_id, guest_display_name, title, artist, status,
     source_round_id, catalog_id, artwork_url, catalog_url)
  values
    (v_round.event_id, null, 'Crowd vote', v_option.title, v_option.artist,
     'queued', p_round_id,
     v_option.catalog_id, v_option.artwork_url, v_option.catalog_url)
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.push_winner_to_queue(uuid, uuid) to authenticated;

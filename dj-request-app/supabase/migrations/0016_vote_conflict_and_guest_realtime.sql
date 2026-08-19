-- ============================================================================
-- 0016 — two things the app could not tell anyone.
--
-- Both are cases where the database knew something and had no way of saying so.
--
-- 1. Starting a vote while one is running was refused by the unique index
--    added in 0001 — correctly, since a second running vote would split the
--    room. But a unique-violation is a bare 23505, which the client turns into
--    its generic wording for any duplicate: "That already exists." Pointed at
--    a DJ trying to start a vote, that reads as though it is talking about a
--    song, and gives no hint that the fix is to end the vote from last time.
--
--    So the check moves in front of the index and says what it means. The
--    index stays: it is what makes the guarantee true under concurrency, and
--    this only makes the usual path explain itself.
--
-- 2. event_guests was never published for realtime, so nothing announced a
--    guest joining or being blocked. The DJ's own screen hid it by reloading
--    after its own action — but the blocked guest's phone had no idea until
--    some unrelated subscription fired, which in practice meant when the next
--    song started. Being told you cannot request, one song late, is
--    indistinguishable from the app being broken.
--
--    Publishing it tells nobody anything new: the select policy from 0003
--    already limits a guest to their own row and the DJ to their own event,
--    and realtime enforces exactly those policies before delivering a change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- create_voting_round — refuse a second vote in words
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

  -- The message the DJ actually needs. A vote with no time limit runs until it
  -- is ended by hand, and a timed one is ended by a countdown in the DJ's
  -- browser — so closing the app mid-vote leaves one running indefinitely, and
  -- that is by far the commonest way to arrive here.
  if exists (
    select 1 from public.voting_rounds
    where event_id = p_event_id and status = 'active'
  ) then
    raise exception 'vote_running: a vote is already running for this event'
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
-- event_guests — broadcast joins and blocks
-- ---------------------------------------------------------------------------
-- Guarded, like 0004, because adding a table to a publication twice is an
-- error and the whole schema is meant to survive being pasted in again.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_guests'
  ) then
    alter publication supabase_realtime add table public.event_guests;
  end if;
end $$;

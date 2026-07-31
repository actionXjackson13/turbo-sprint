-- ============================================================================
-- 0002_functions_triggers.sql — server-authoritative behaviour.
--
-- Everything a client must not be trusted to do lives here: vote counting,
-- the active-request cap, request creation (which must also create the
-- founding vote atomically), and voting-round finalisation.
--
-- SECURITY DEFINER functions below all pin `search_path` so a caller cannot
-- shadow the objects they reference.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New DJ accounts get a profile automatically. Anonymous guests must NOT, or
-- they would appear as DJs.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper predicates used throughout the RLS policies in 0003.
-- ---------------------------------------------------------------------------

-- Is the caller the DJ who owns this event?
create or replace function public.is_event_owner(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.dj_id = auth.uid()
  );
$$;

-- Has the caller joined this event as a guest?
create or replace function public.is_event_guest(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.event_guests g
    where g.event_id = target_event_id and g.guest_user_id = auth.uid()
  );
$$;

-- Can the caller see this event at all (guest or owning DJ)?
create or replace function public.is_event_member(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_event_owner(target_event_id)
      or public.is_event_guest(target_event_id);
$$;

-- The caller's event_guests row id for an event, if any.
create or replace function public.current_guest_id(target_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id from public.event_guests g
  where g.event_id = target_event_id and g.guest_user_id = auth.uid();
$$;

-- Resolve the owning event of a request / round / option, so policies on those
-- child tables can reuse the membership predicates above.
create or replace function public.request_event_id(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select event_id from public.song_requests where id = p_request_id;
$$;

create or replace function public.round_event_id(p_round_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select event_id from public.voting_rounds where id = p_round_id;
$$;

create or replace function public.option_event_id(p_option_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.event_id
  from public.voting_options o
  join public.voting_rounds r on r.id = o.round_id
  where o.id = p_option_id;
$$;

-- Is this round still open for voting according to the server's clock?
-- Used by the voting_responses policies, which is what actually stops a late
-- vote — the countdown in the UI is only a display.
create or replace function public.round_accepts_votes(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.voting_rounds r
    where r.id = p_round_id
      and r.status = 'active'
      and (r.ends_at is null or r.ends_at > now())
  );
$$;

-- Is the caller blocked at this event?
create or replace function public.is_guest_blocked(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select g.is_blocked from public.event_guests g
     where g.event_id = target_event_id and g.guest_user_id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- vote_count is denormalised onto song_requests so "sort by most votes" can
-- use an index. These triggers are its only writer.
-- ---------------------------------------------------------------------------
create or replace function public.sync_request_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.request_id, old.request_id);
begin
  update public.song_requests r
  set vote_count = (
    select count(*) from public.request_votes v where v.request_id = target
  )
  where r.id = target;

  return null;
end;
$$;

create trigger request_votes_sync_count
  after insert or delete on public.request_votes
  for each row execute function public.sync_request_vote_count();

-- ---------------------------------------------------------------------------
-- Housekeeping on song_requests: keep updated_at honest, and keep
-- queue_position meaningful only while a request is queued.
-- ---------------------------------------------------------------------------
create or replace function public.song_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guest_active_count integer;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    -- Five active requests per guest. A trigger rather than a constraint,
    -- because the rule spans rows.
    if new.guest_id is not null then
      select count(*) into guest_active_count
      from public.song_requests r
      where r.guest_id = new.guest_id
        and r.status in ('pending', 'accepted', 'queued');

      if guest_active_count >= 5 then
        raise exception 'limit_reached: you can have 5 active requests at a time'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.status = 'queued' then
    if new.queue_position is null then
      select coalesce(max(r.queue_position), -1) + 1 into new.queue_position
      from public.song_requests r
      where r.event_id = new.event_id and r.status = 'queued';
    end if;
  else
    new.queue_position := null;
  end if;

  return new;
end;
$$;

create trigger song_requests_before_write_trg
  before insert or update on public.song_requests
  for each row execute function public.song_requests_before_write();

-- ---------------------------------------------------------------------------
-- create_song_request — the only path by which a guest creates a request.
--
-- Doing this in one function means the request and its founding vote are
-- created together, and it lets the server (not the client) decide whether
-- intake is open, whether the guest is blocked, and that is_founding_vote is
-- true. Guests are given no direct INSERT policy on song_requests.
-- ---------------------------------------------------------------------------
create or replace function public.create_song_request(
  p_event_id uuid,
  p_title    text,
  p_artist   text
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
    (event_id, guest_id, guest_display_name, title, artist)
  values
    (p_event_id, v_guest.id, v_guest.display_name, trim(p_title), trim(p_artist))
  returning * into v_request;

  -- The submitter's vote. Only this function can set is_founding_vote.
  insert into public.request_votes (request_id, guest_id, is_founding_vote)
  values (v_request.id, v_guest.id, true);

  -- Re-read so the returned row carries the trigger-updated vote_count.
  select * into v_request from public.song_requests where id = v_request.id;
  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_event — the only way an event_guests row is created or renamed.
--
-- Routing this through a function means guests need no INSERT or UPDATE
-- privilege on event_guests at all, so there is no way for a guest to forge a
-- membership for another user or clear their own is_blocked flag.
-- ---------------------------------------------------------------------------
create or replace function public.join_event(
  p_code         text,
  p_display_name text
)
returns public.event_guests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
  v_guest public.event_guests;
begin
  if auth.uid() is null then
    raise exception 'unauthorized: no session' using errcode = 'insufficient_privilege';
  end if;

  select * into v_event
  from public.events
  where code = upper(trim(p_code)) and status = 'active';

  if not found then
    raise exception 'not_found: no event found with that code'
      using errcode = 'no_data_found';
  end if;

  insert into public.event_guests (event_id, guest_user_id, display_name)
  values (v_event.id, auth.uid(), trim(p_display_name))
  on conflict (event_id, guest_user_id)
    -- Rejoining renames rather than duplicating. is_blocked is deliberately
    -- untouched, so a blocked guest cannot clear it by rejoining.
    do update set display_name = excluded.display_name
  returning * into v_guest;

  return v_guest;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_guest_blocked — DJ-only moderation.
-- ---------------------------------------------------------------------------
create or replace function public.set_guest_blocked(
  p_event_id uuid,
  p_guest_id uuid,
  p_blocked  boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can block guests'
      using errcode = 'insufficient_privilege';
  end if;

  update public.event_guests
  set is_blocked = p_blocked
  where id = p_guest_id and event_id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_voting_round — validates the 2..4 option count server-side, which a
-- per-row CHECK constraint cannot express.
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
    insert into public.voting_options (round_id, title, artist, display_order)
    values (
      v_round_id,
      trim(v_option ->> 'title'),
      trim(v_option ->> 'artist'),
      v_index
    );
    v_index := v_index + 1;
  end loop;

  return v_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_round_winner — most votes wins; ties break by display order. Returns
-- null when nobody voted.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_round_winner(p_round_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id
  from public.voting_options o
  left join public.voting_responses r on r.option_id = o.id
  where o.round_id = p_round_id
  group by o.id, o.display_order
  having count(r.id) > 0
  order by count(r.id) desc, o.display_order asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- finalize_voting_round_if_expired — lets any event member close out a round
-- whose time is up.
--
-- This exists so timed rounds resolve without a scheduler. It is safe to
-- expose: the WHERE clause only matches a round that is genuinely active and
-- genuinely past its end time according to the server's clock, so a caller
-- cannot end a round early by calling it. It is idempotent and race-safe —
-- concurrent callers all attempt the same UPDATE and only the first matches.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_voting_round_if_expired(p_round_id uuid)
returns public.voting_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.voting_rounds;
begin
  select * into v_round from public.voting_rounds where id = p_round_id;
  if not found then
    raise exception 'not_found: vote does not exist' using errcode = 'no_data_found';
  end if;

  if not public.is_event_member(v_round.event_id) then
    raise exception 'forbidden: not a member of this event'
      using errcode = 'insufficient_privilege';
  end if;

  update public.voting_rounds
  set status           = 'ended',
      ended_at         = now(),
      winner_option_id = public.resolve_round_winner(p_round_id)
  where id = p_round_id
    and status = 'active'
    and ends_at is not null
    and ends_at <= now()
  returning * into v_round;

  if not found then
    -- Not expired, or someone else already finalised it. Return current state.
    select * into v_round from public.voting_rounds where id = p_round_id;
  end if;

  return v_round;
end;
$$;

-- ---------------------------------------------------------------------------
-- end_voting_round — DJ ends a round early and the server picks the winner,
-- so the outcome never depends on a client's tally.
-- ---------------------------------------------------------------------------
create or replace function public.end_voting_round(p_round_id uuid)
returns public.voting_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.voting_rounds;
begin
  select * into v_round from public.voting_rounds where id = p_round_id;
  if not found then
    raise exception 'not_found: vote does not exist' using errcode = 'no_data_found';
  end if;
  if not public.is_event_owner(v_round.event_id) then
    raise exception 'forbidden: only the event owner can end a vote'
      using errcode = 'insufficient_privilege';
  end if;

  update public.voting_rounds
  set status           = 'ended',
      ended_at         = now(),
      winner_option_id = public.resolve_round_winner(p_round_id)
  where id = p_round_id and status = 'active'
  returning * into v_round;

  if not found then
    select * into v_round from public.voting_rounds where id = p_round_id;
  end if;

  return v_round;
end;
$$;

-- ---------------------------------------------------------------------------
-- push_winner_to_queue — copies a voting option into the queue as a request
-- with no owning guest.
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
    (event_id, guest_id, guest_display_name, title, artist, status, source_round_id)
  values
    (v_round.event_id, null, 'Crowd vote', v_option.title, v_option.artist,
     'queued', p_round_id)
  returning * into v_request;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- reorder_queue — applies a new queue ordering in one statement.
-- ---------------------------------------------------------------------------
create or replace function public.reorder_queue(
  p_event_id    uuid,
  p_request_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can reorder the queue'
      using errcode = 'insufficient_privilege';
  end if;

  update public.song_requests r
  set queue_position = ordered.position - 1
  from (
    select id, ordinality as position
    from unnest(p_request_ids) with ordinality as t(id, ordinality)
  ) as ordered
  where r.id = ordered.id
    and r.event_id = p_event_id
    and r.status = 'queued';
end;
$$;

-- ---------------------------------------------------------------------------
-- set_now_playing — sets the track and retires the promoted request together.
-- ---------------------------------------------------------------------------
create or replace function public.set_now_playing(
  p_event_id   uuid,
  p_title      text,
  p_artist     text,
  p_request_id uuid
)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can do this'
      using errcode = 'insufficient_privilege';
  end if;

  update public.events
  set now_playing_title      = p_title,
      now_playing_artist     = p_artist,
      now_playing_request_id = p_request_id
  where id = p_event_id
  returning * into v_event;

  if p_request_id is not null then
    update public.song_requests
    set status = 'played'
    where id = p_request_id and event_id = p_event_id;
  end if;

  return v_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- end_event — closes intake and cancels any running round in one step.
-- ---------------------------------------------------------------------------
create or replace function public.end_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can end this event'
      using errcode = 'insufficient_privilege';
  end if;

  update public.voting_rounds
  set status = 'cancelled', ended_at = now()
  where event_id = p_event_id and status = 'active';

  update public.events
  set status = 'ended', request_status = 'closed', ended_at = now()
  where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_event — generates a collision-free join code server-side.
-- ---------------------------------------------------------------------------
create or replace function public.create_event(p_name text)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Same reduced alphabet as the client: no I/1, O/0, S/5, Z/2, B/8.
  v_alphabet constant text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  v_code     text;
  v_event    public.events;
  v_attempt  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'unauthorized: sign in to create an event'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'forbidden: only DJ accounts can create events'
      using errcode = 'insufficient_privilege';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into public.events (dj_id, name, code)
      values (auth.uid(), trim(p_name), v_code)
      returning * into v_event;
      return v_event;
    exception when unique_violation then
      -- Code already in use by another live event; try again.
      if v_attempt >= 20 then
        raise exception 'unknown: could not allocate an event code';
      end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aggregate tallies. Exposed as a view so guests can see totals without being
-- able to read other guests' individual ballots.
-- ---------------------------------------------------------------------------
create or replace view public.voting_round_tallies
with (security_invoker = true) as
  select
    o.round_id,
    o.id as option_id,
    count(r.id)::integer as votes
  from public.voting_options o
  left join public.voting_responses r on r.option_id = o.id
  group by o.round_id, o.id;

comment on view public.voting_round_tallies is
  'Aggregate vote counts per option. security_invoker means the caller''s RLS '
  'on voting_options applies, so tallies are visible exactly to event members.';

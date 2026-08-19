-- ============================================================================
-- SoundBoard — complete database schema
--
-- GENERATED FILE. Do not edit: run `npm run schema` after changing anything
-- in supabase/migrations, which is where these actually live.
--
-- To set up a Supabase project: open the SQL Editor, paste this whole file,
-- and run it. Run it once, on a fresh project — it stops with instructions if
-- the schema is already there.
--
-- Built from 16 migrations:
--   0001_init_schema.sql
--   0002_functions_triggers.sql
--   0003_rls_policies.sql
--   0004_realtime.sql
--   0005_fuzzy_dedupe.sql
--   0006_catalog_metadata.sql
--   0007_now_playing_artwork.sql
--   0008_announcements.sql
--   0009_voting_option_catalog.sql
--   0010_dj_added_songs.sql
--   0011_dj_sets.sql
--   0012_queue_groups.sql
--   0013_no_duplicate_songs.sql
--   0014_event_theme.sql
--   0015_event_theme_background.sql
--   0016_vote_conflict_and_guest_realtime.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Already installed?
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'profiles'
  ) then
    raise exception using
      message = 'SoundBoard is already installed on this project. Nothing was changed.',
      hint = 'To rebuild from scratch, run these three lines and then paste this file again: '
             'drop schema public cascade; create schema public; '
             'grant usage on schema public to anon, authenticated, service_role;';
  end if;
end $$;

-- >>> 0001_init_schema.sql ================================================

-- ============================================================================
-- 0001_init_schema.sql — tables, keys, constraints and indexes.
--
-- Security note: RLS is enabled here but no policies are created until 0003.
-- With RLS on and no policies, every table denies all access by default, so
-- there is never a window where the schema exists unprotected.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- normalize_song_text — duplicate-detection normalisation.
--
-- Defined here rather than in 0002 because song_requests has generated columns
-- that depend on it. Must be IMMUTABLE to be usable in a generated column.
--
-- This is the authority for normalisation; src/utils/normalizeText.ts is a
-- client-side mirror kept in step with it. Both are covered by the shared
-- cases in test/utils/normalizeText.test.ts. Steps: lowercase, replace any
-- run of non-letter/non-digit characters with a single space, then trim.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_song_text(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(input), '[^[:alnum:] ]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles — DJ accounts. Guests are anonymous auth users and never get a row.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null check (char_length(trim(display_name)) between 2 and 24),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'DJ accounts. Anonymous guest users deliberately have no row here.';

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id             uuid primary key default gen_random_uuid(),
  dj_id          uuid        not null references public.profiles (id) on delete cascade,
  name           text        not null check (char_length(trim(name)) between 1 and 60),
  code           text        not null check (code ~ '^[A-Z0-9]{4,8}$'),
  status         text        not null default 'active'
                   check (status in ('active', 'ended')),
  request_status text        not null default 'open'
                   check (request_status in ('open', 'paused', 'closed')),
  now_playing_title  text,
  now_playing_artist text,
  -- now_playing_request_id is added in 0002, after song_requests exists.
  created_at     timestamptz not null default now(),
  ended_at       timestamptz,
  -- Either both now-playing fields are set, or neither is.
  constraint now_playing_pair check (
    (now_playing_title is null) = (now_playing_artist is null)
  )
);

-- Join codes must be unique among events guests can still join. Reusing a code
-- from a finished event is fine and keeps the 4-character space usable.
create unique index events_active_code_key
  on public.events (code)
  where status = 'active';

create index events_dj_id_idx on public.events (dj_id, created_at desc);

-- ---------------------------------------------------------------------------
-- event_guests — one row per guest per event.
-- ---------------------------------------------------------------------------
create table public.event_guests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid        not null references public.events (id) on delete cascade,
  -- The guest's anonymous auth.users id. This is what RLS verifies against.
  guest_user_id uuid        not null references auth.users (id) on delete cascade,
  display_name  text        not null check (char_length(trim(display_name)) between 2 and 24),
  is_blocked    boolean     not null default false,
  joined_at     timestamptz not null default now(),
  unique (event_id, guest_user_id)
);

create index event_guests_event_idx on public.event_guests (event_id);
create index event_guests_user_idx  on public.event_guests (guest_user_id);

-- ---------------------------------------------------------------------------
-- song_requests
-- ---------------------------------------------------------------------------
create table public.song_requests (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid        not null references public.events (id) on delete cascade,
  -- Null when the DJ promoted a voting-round winner rather than a guest asking.
  guest_id            uuid        references public.event_guests (id) on delete set null,
  guest_display_name  text        not null,
  title               text        not null check (char_length(trim(title)) between 1 and 120),
  artist              text        not null check (char_length(trim(artist)) between 1 and 120),
  -- Normalisation happens in the database, so a client cannot dodge duplicate
  -- detection by sending pre-mangled text.
  normalized_title    text generated always as (public.normalize_song_text(title))  stored,
  normalized_artist   text generated always as (public.normalize_song_text(artist)) stored,
  -- Maintained by trigger from request_votes. Never written by a client.
  vote_count          integer     not null default 0 check (vote_count >= 0),
  status              text        not null default 'pending'
                        check (status in ('pending', 'accepted', 'queued', 'played', 'declined')),
  -- Ordering within the queue; only meaningful while status = 'queued'.
  queue_position      integer,
  source_round_id     uuid,  -- FK added in 0002, after voting_rounds exists.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index song_requests_event_status_idx
  on public.song_requests (event_id, status);

create index song_requests_event_votes_idx
  on public.song_requests (event_id, vote_count desc, created_at desc);

create index song_requests_guest_idx
  on public.song_requests (guest_id);

-- Backs the duplicate lookup performed before every new request.
create index song_requests_dedupe_idx
  on public.song_requests (event_id, normalized_title, normalized_artist);

create index song_requests_queue_idx
  on public.song_requests (event_id, queue_position)
  where status = 'queued';

-- ---------------------------------------------------------------------------
-- request_votes — the source of truth for song_requests.vote_count.
-- ---------------------------------------------------------------------------
create table public.request_votes (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid        not null references public.song_requests (id) on delete cascade,
  guest_id          uuid        not null references public.event_guests (id) on delete cascade,
  -- True only for the submitter's automatic vote, which cannot be withdrawn.
  is_founding_vote  boolean     not null default false,
  created_at        timestamptz not null default now(),
  -- One vote per guest per request, enforced by the database itself.
  unique (request_id, guest_id)
);

create index request_votes_request_idx on public.request_votes (request_id);
create index request_votes_guest_idx   on public.request_votes (guest_id);

-- ---------------------------------------------------------------------------
-- voting_rounds
-- ---------------------------------------------------------------------------
create table public.voting_rounds (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid        not null references public.events (id) on delete cascade,
  status           text        not null default 'active'
                     check (status in ('active', 'ended', 'cancelled')),
  -- Null means the round runs until the DJ ends it.
  duration_seconds integer     check (duration_seconds is null or duration_seconds > 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  winner_option_id uuid,  -- FK added in 0002, after voting_options exists.
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  -- ends_at is present exactly when the round has a duration.
  constraint ends_at_matches_duration check (
    (duration_seconds is null) = (ends_at is null)
  )
);

-- At most one running round per event, guaranteed by the database rather than
-- by application checks that could race.
create unique index voting_rounds_one_active_per_event
  on public.voting_rounds (event_id)
  where status = 'active';

create index voting_rounds_event_idx
  on public.voting_rounds (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- voting_options
-- ---------------------------------------------------------------------------
create table public.voting_options (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid        not null references public.voting_rounds (id) on delete cascade,
  title         text        not null check (char_length(trim(title)) between 1 and 120),
  artist        text        not null check (char_length(trim(artist)) between 1 and 120),
  display_order smallint    not null check (display_order between 0 and 3),
  created_at    timestamptz not null default now(),
  unique (round_id, display_order)
);

create index voting_options_round_idx on public.voting_options (round_id);

-- ---------------------------------------------------------------------------
-- voting_responses — one ballot per guest per round.
-- ---------------------------------------------------------------------------
create table public.voting_responses (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid        not null references public.voting_rounds (id) on delete cascade,
  option_id  uuid        not null references public.voting_options (id) on delete cascade,
  guest_id   uuid        not null references public.event_guests (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Changing a vote updates this row; it never creates a second one.
  unique (round_id, guest_id)
);

create index voting_responses_round_idx  on public.voting_responses (round_id);
create index voting_responses_option_idx on public.voting_responses (option_id);

-- ---------------------------------------------------------------------------
-- Deferred foreign keys (circular references resolved now all tables exist).
-- ---------------------------------------------------------------------------
alter table public.events
  add column now_playing_request_id uuid
    references public.song_requests (id) on delete set null;

alter table public.song_requests
  add constraint song_requests_source_round_fkey
    foreign key (source_round_id) references public.voting_rounds (id) on delete set null;

alter table public.voting_rounds
  add constraint voting_rounds_winner_option_fkey
    foreign key (winner_option_id) references public.voting_options (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Policies arrive in 0003; until then everything is
-- denied, which is the safe default.
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.events           enable row level security;
alter table public.event_guests     enable row level security;
alter table public.song_requests    enable row level security;
alter table public.request_votes    enable row level security;
alter table public.voting_rounds    enable row level security;
alter table public.voting_options   enable row level security;
alter table public.voting_responses enable row level security;


-- >>> 0002_functions_triggers.sql =========================================

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


-- >>> 0003_rls_policies.sql ===============================================

-- ============================================================================
-- 0003_rls_policies.sql — row level security.
--
-- Model
-- -----
-- Every actor has a real, cryptographically verified `auth.uid()`:
--   * DJs sign in with email + password and own a row in `profiles`.
--   * Guests get an ANONYMOUS Supabase session (`signInAnonymously`), so a
--     guest identity is exactly as trustworthy inside these policies as a full
--     account. This is why guest identity is not a client-generated string —
--     a value the browser makes up could never be verified here, and the
--     policies below would degrade into rubber stamps.
--
-- Writes a client must not be trusted with have NO policy at all and go
-- through the SECURITY DEFINER functions in 0002 instead:
--   * creating a request (must also create the founding vote, and check
--     intake status, blocking and the active-request cap)
--   * joining an event (must not be able to forge another guest's row or
--     clear is_blocked)
--   * blocking a guest, ending/finalising a round, pushing a winner,
--     reordering the queue, setting now playing, ending an event
--
-- Note on `using (true)` for profiles/events SELECT: neither table holds
-- anything secret (a DJ display name, an event name and its join code). Guests
-- must read an event by code *before* they have any membership, so a
-- membership-scoped policy is impossible here. Email addresses and passwords
-- live in `auth.users`, which is never exposed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_all
  on public.profiles for select
  using (true);

create policy profiles_insert_self
  on public.profiles for insert
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create policy events_select_all
  on public.events for select
  using (true);

create policy events_insert_own
  on public.events for insert
  with check (dj_id = auth.uid());

create policy events_update_own
  on public.events for update
  using (dj_id = auth.uid())
  with check (dj_id = auth.uid());

create policy events_delete_own
  on public.events for delete
  using (dj_id = auth.uid());

-- ---------------------------------------------------------------------------
-- event_guests
--
-- Read-only for clients. All writes go through join_event / set_guest_blocked.
-- A guest sees only their own row; the DJ sees every guest at their event.
-- ---------------------------------------------------------------------------
create policy event_guests_select_self_or_owner
  on public.event_guests for select
  using (
    guest_user_id = auth.uid()
    or public.is_event_owner(event_id)
  );

-- ---------------------------------------------------------------------------
-- song_requests
--
-- Visible to everyone at the event. Inserts happen only via
-- create_song_request / push_winner_to_queue; status changes and deletion are
-- the DJ's alone. Guests therefore cannot change a status or touch vote_count.
-- ---------------------------------------------------------------------------
create policy song_requests_select_members
  on public.song_requests for select
  using (public.is_event_member(event_id));

create policy song_requests_update_owner
  on public.song_requests for update
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create policy song_requests_delete_owner
  on public.song_requests for delete
  using (public.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- request_votes
--
-- A guest may add and withdraw their own vote. Two things are enforced here
-- that the UI also shows but must not be relied on for:
--   * is_founding_vote must be false on any client insert, so a guest cannot
--     mint an unremovable vote; only create_song_request sets it true.
--   * a founding vote cannot be deleted, so a submitter cannot un-vote their
--     own request.
-- ---------------------------------------------------------------------------
create policy request_votes_select_members
  on public.request_votes for select
  using (public.is_event_member(public.request_event_id(request_id)));

create policy request_votes_insert_self
  on public.request_votes for insert
  with check (
    guest_id = public.current_guest_id(public.request_event_id(request_id))
    and is_founding_vote = false
    and not public.is_guest_blocked(public.request_event_id(request_id))
    and exists (
      select 1 from public.events e
      where e.id = public.request_event_id(request_id)
        and e.status = 'active'
    )
  );

create policy request_votes_delete_own
  on public.request_votes for delete
  using (
    guest_id = public.current_guest_id(public.request_event_id(request_id))
    and is_founding_vote = false
  );

-- ---------------------------------------------------------------------------
-- voting_rounds
-- ---------------------------------------------------------------------------
create policy voting_rounds_select_members
  on public.voting_rounds for select
  using (public.is_event_member(event_id));

create policy voting_rounds_insert_owner
  on public.voting_rounds for insert
  with check (public.is_event_owner(event_id));

create policy voting_rounds_update_owner
  on public.voting_rounds for update
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create policy voting_rounds_delete_owner
  on public.voting_rounds for delete
  using (public.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- voting_options
-- ---------------------------------------------------------------------------
create policy voting_options_select_members
  on public.voting_options for select
  using (public.is_event_member(public.round_event_id(round_id)));

create policy voting_options_insert_owner
  on public.voting_options for insert
  with check (public.is_event_owner(public.round_event_id(round_id)));

create policy voting_options_update_owner
  on public.voting_options for update
  using (public.is_event_owner(public.round_event_id(round_id)))
  with check (public.is_event_owner(public.round_event_id(round_id)));

create policy voting_options_delete_owner
  on public.voting_options for delete
  using (public.is_event_owner(public.round_event_id(round_id)));

-- ---------------------------------------------------------------------------
-- voting_responses
--
-- SELECT is granted to every member of the event, not just the ballot's owner.
-- That is a deliberate trade-off: Realtime only delivers change events for
-- rows the subscriber is allowed to read, so a private-ballot policy would
-- mean guests never saw the live totals the product requires. Ballots are not
-- sensitive here — they are song picks at a party, and the app shows aggregate
-- percentages rather than a per-guest breakdown.
--
-- Crucially, this is read-only exposure. The INSERT/UPDATE policies below
-- still pin `guest_id` to the caller, so no guest can cast or alter anyone
-- else's vote, and one-vote-per-round stays enforced by the unique index.
--
-- The `round_accepts_votes` check is the real deadline. It compares against
-- the database's own now(), so a client with a wrong or tampered clock cannot
-- vote after a round has expired, whether or not anyone has finalised it yet.
-- ---------------------------------------------------------------------------
create policy voting_responses_select_members
  on public.voting_responses for select
  using (public.is_event_member(public.round_event_id(round_id)));

create policy voting_responses_insert_self
  on public.voting_responses for insert
  with check (
    guest_id = public.current_guest_id(public.round_event_id(round_id))
    and public.round_accepts_votes(round_id)
    and not public.is_guest_blocked(public.round_event_id(round_id))
    -- The chosen option must belong to the round being voted in.
    and public.option_event_id(option_id) = public.round_event_id(round_id)
    and exists (
      select 1 from public.voting_options o
      where o.id = option_id and o.round_id = round_id
    )
  );

create policy voting_responses_update_own
  on public.voting_responses for update
  using (
    guest_id = public.current_guest_id(public.round_event_id(round_id))
    and public.round_accepts_votes(round_id)
  )
  with check (
    guest_id = public.current_guest_id(public.round_event_id(round_id))
    and public.round_accepts_votes(round_id)
    and exists (
      select 1 from public.voting_options o
      where o.id = option_id and o.round_id = round_id
    )
  );

-- ---------------------------------------------------------------------------
-- Column privileges.
--
-- RLS decides which rows are reachable; these decide which columns may be
-- written. Restricting song_requests UPDATE to the columns a DJ legitimately
-- changes means vote_count cannot be set directly even by the event owner —
-- it stays the trigger's to maintain.
-- ---------------------------------------------------------------------------
revoke update on public.song_requests from authenticated, anon;
grant  update (status, queue_position, updated_at)
  on public.song_requests to authenticated;

revoke update on public.events from authenticated, anon;
grant  update (name, request_status, now_playing_title, now_playing_artist,
               now_playing_request_id, status, ended_at)
  on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges. Only the RPCs the app actually calls are exposed;
-- the internal helpers stay callable because policies reference them.
-- ---------------------------------------------------------------------------
grant execute on function public.join_event(text, text)                 to authenticated;
grant execute on function public.create_event(text)                     to authenticated;
grant execute on function public.create_song_request(uuid, text, text)  to authenticated;
grant execute on function public.create_voting_round(uuid, jsonb, integer) to authenticated;
grant execute on function public.end_voting_round(uuid)                 to authenticated;
grant execute on function public.finalize_voting_round_if_expired(uuid) to authenticated;
grant execute on function public.push_winner_to_queue(uuid, uuid)       to authenticated;
grant execute on function public.reorder_queue(uuid, uuid[])            to authenticated;
grant execute on function public.set_guest_blocked(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_now_playing(uuid, text, text, uuid) to authenticated;
grant execute on function public.end_event(uuid)                        to authenticated;


-- >>> 0004_realtime.sql ===================================================

-- ============================================================================
-- 0004_realtime.sql — publish the tables the app subscribes to.
--
-- Realtime respects RLS: a client only receives change events for rows it
-- could have selected, so adding these tables does not widen access.
--
-- voting_responses is published so one guest's vote updates everyone's tallies
-- immediately; its SELECT policy is event-wide precisely so these events are
-- delivered (see the note in 0003). Clients treat every event as a signal to
-- re-read — for tallies, from the aggregate voting_round_tallies view.
--
-- Replica identity is deliberately left at the default (primary key). FULL is
-- unnecessary here because no subscriber inspects a deleted row's old values,
-- and it is actively harmful on song_requests: a table whose replica identity
-- is FULL cannot be updated while it has generated columns that the
-- publication does not carry, which would break every vote-count update.
-- ============================================================================

-- Postgres has no "add table if not exists" for publications, and adding one
-- twice is an error — so this checks first. That matters because the whole
-- schema is meant to be safe to run again: a project set up by pasting it into
-- the SQL editor should not break on the second paste.
do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'song_requests', 'request_votes',
    'voting_rounds', 'voting_options', 'voting_responses'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- >>> 0005_fuzzy_dedupe.sql ===============================================

-- ============================================================================
-- 0005_fuzzy_dedupe.sql — typo-tolerant duplicate detection.
--
-- Exact matching on normalised text (0001) misses the way people actually
-- type song titles at an event: "Dont Stop Believin", "The Weekend", a dropped
-- letter. Each miss creates a rival request and splits the vote for one song
-- across two entries, which is exactly what the duplicate nudge exists to
-- prevent.
--
-- Two changes:
--   1. Normalisation now deletes apostrophes instead of turning them into
--      spaces, so "Don't" collapses to "dont" and matches a guest who typed
--      "Dont". Previously it became "don t", matching neither spelling.
--   2. pg_trgm similarity catches what is left.
-- ============================================================================

create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Redefined normalisation. Mirrors src/utils/normalizeText.ts; the shared
-- cases in test/utils/normalizeText.test.ts and the migration test pin them
-- together.
--
-- U&'...' escapes keep the apostrophe variants readable and ASCII-safe:
--   0027 '   2019 ’   2018 ‘   02BC ʼ   0060 `   00B4 ´
-- ---------------------------------------------------------------------------
create or replace function public.normalize_song_text(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        translate(lower(input), U&'\0027\2019\2018\02BC\0060\00B4', ''),
        '[^[:alnum:] ]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Rebuild the generated columns.
--
-- Postgres does not recompute STORED generated columns when the function
-- behind them is replaced — existing rows would keep values from the old
-- normalisation while new rows used the new one, so identical songs would stop
-- matching. Dropping and re-adding forces every row through the new function.
--
-- Dropping these columns also drops the dedupe index that covers them, so it
-- is recreated below.
-- ---------------------------------------------------------------------------
alter table public.song_requests
  drop column normalized_title,
  drop column normalized_artist;

alter table public.song_requests
  add column normalized_title  text generated always as (public.normalize_song_text(title))  stored,
  add column normalized_artist text generated always as (public.normalize_song_text(artist)) stored;

create index song_requests_dedupe_idx
  on public.song_requests (event_id, normalized_title, normalized_artist);

-- Supports the similarity scan. The match key is title and artist together,
-- so the index is on that same expression.
create index song_requests_trgm_idx
  on public.song_requests
  using gin ((normalized_title || ' ' || normalized_artist) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- find_similar_request — the duplicate lookup behind the "someone already
-- asked for this" nudge.
--
-- SECURITY INVOKER (the default) on purpose: the caller's RLS applies, so a
-- guest can only ever be shown a request from an event they belong to. Making
-- it DEFINER would turn it into a way to probe other events' requests.
--
-- Ordering matches DemoService.findSimilarRequest: an exact normalised match
-- always wins, then the highest similarity above the threshold.
-- ---------------------------------------------------------------------------
create or replace function public.find_similar_request(
  p_event_id uuid,
  p_title    text,
  p_artist   text
)
returns setof public.song_requests
language sql
stable
as $$
  with target as (
    select public.normalize_song_text(p_title)  as n_title,
           public.normalize_song_text(p_artist) as n_artist
  )
  select r.*
  from public.song_requests r, target t
  where r.event_id = p_event_id
    -- A previously declined song shouldn't block a fresh ask.
    and r.status <> 'declined'
    and (
      (r.normalized_title = t.n_title and r.normalized_artist = t.n_artist)
      or similarity(
           r.normalized_title || ' ' || r.normalized_artist,
           t.n_title || ' ' || t.n_artist
         ) >= 0.55
    )
  order by
    -- Exact first, then closest.
    (r.normalized_title = t.n_title and r.normalized_artist = t.n_artist) desc,
    similarity(
      r.normalized_title || ' ' || r.normalized_artist,
      t.n_title || ' ' || t.n_artist
    ) desc,
    r.created_at asc
  limit 1;
$$;

grant execute on function public.find_similar_request(uuid, text, text)
  to authenticated;


-- >>> 0006_catalog_metadata.sql ===========================================

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


-- >>> 0007_now_playing_artwork.sql ========================================

-- ============================================================================
-- 0007_now_playing_artwork.sql — let the current track carry its cover.
--
-- Artwork reached the request rows but stopped there, so the song a guest had
-- picked by its sleeve became two lines of text the moment the DJ started
-- playing it — on the DJ's own panel and on every guest's home screen, which
-- are the two places the current track matters most.
--
-- Stored on the event rather than read back through now_playing_request_id,
-- for two reasons. A track can be set with no request behind it at all — a
-- voting-round winner, or a DJ playing something nobody asked for — and a
-- request can be deleted while the song it named is still playing. Copying the
-- URL at the moment it is set keeps the display independent of both.
--
-- Nullable and defaulted to null: every event that exists now has no artwork
-- for its current track, and anything typed by hand never will. Nothing may
-- assume it is present.
--
-- Written only by set_now_playing, which is DJ-only and already checks
-- ownership, so this adds no new write surface. It is plain display metadata:
-- never joined on, never trusted, never used for authorisation.
-- ============================================================================

alter table public.events
  add column if not exists now_playing_artwork_url text;

-- ---------------------------------------------------------------------------
-- set_now_playing — now also records the cover.
--
-- The parameter is defaulted so existing 4-argument callers keep working, and
-- the old signature is dropped rather than left alongside this one: an
-- overload pair would make every 4-argument call ambiguous, and Postgres
-- rejects those outright rather than picking one.
-- ---------------------------------------------------------------------------
drop function if exists public.set_now_playing(uuid, text, text, uuid);

create or replace function public.set_now_playing(
  p_event_id    uuid,
  p_title       text,
  p_artist      text,
  p_request_id  uuid,
  p_artwork_url text default null
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
  set now_playing_title       = p_title,
      now_playing_artist      = p_artist,
      now_playing_request_id  = p_request_id,
      now_playing_artwork_url = p_artwork_url
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

grant execute on function public.set_now_playing(uuid, text, text, uuid, text)
  to authenticated;

-- The DJ writes the events row directly for name and intake status, so the new
-- column needs the same column-level grant its siblings already have.
grant update (now_playing_artwork_url) on public.events to authenticated;


-- >>> 0008_announcements.sql ==============================================

-- ============================================================================
-- 0008_announcements.sql — a short, timed message from the DJ to the room.
--
-- "Last orders in ten minutes", "requests close at midnight", "happy birthday
-- Sam" — things a DJ currently has to shout or hand to somebody with a
-- microphone. It appears above the current track on every guest's screen and
-- takes itself down when it expires.
--
-- Two columns rather than one: the text, and when it stops being shown. They
-- are set and cleared together, and the check keeps them that way — a message
-- with no expiry would stay up all night, and an expiry with no message is
-- nothing at all.
--
-- The caller passes a *duration* and the database computes the expiry from its
-- own clock, for the same reason voting rounds do: a phone with a skewed clock
-- must not be able to post a message that outlives what the DJ chose.
-- ============================================================================

alter table public.events
  add column if not exists announcement_text       text,
  add column if not exists announcement_expires_at timestamptz;

alter table public.events
  drop constraint if exists announcement_pair;

alter table public.events
  add constraint announcement_pair check (
    (announcement_text is null) = (announcement_expires_at is null)
  );

-- ---------------------------------------------------------------------------
-- set_announcement — post a message, or clear the one that is up.
--
-- Passing a null message clears it, which is what the DJ's "Clear" does; there
-- is no separate function for taking one down.
-- ---------------------------------------------------------------------------
create or replace function public.set_announcement(
  p_event_id         uuid,
  p_message          text,
  p_duration_seconds integer
)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event   public.events;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.is_event_owner(p_event_id) then
    raise exception 'forbidden: only the event owner can do this'
      using errcode = 'insufficient_privilege';
  end if;

  if v_message is not null then
    if p_duration_seconds is null or p_duration_seconds <= 0 then
      raise exception 'invalid_input: a message needs a positive duration'
        using errcode = 'check_violation';
    end if;
    -- Long enough for anything worth saying to a room, short enough that it
    -- cannot be used as a second now-playing card.
    if length(v_message) > 140 then
      raise exception 'invalid_input: message too long'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.events
  set announcement_text = v_message,
      announcement_expires_at = case
        when v_message is null then null
        else now() + make_interval(secs => p_duration_seconds)
      end
  where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

grant execute on function public.set_announcement(uuid, text, integer)
  to authenticated;


-- >>> 0009_voting_option_catalog.sql ======================================

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


-- >>> 0010_dj_added_songs.sql =============================================

-- ============================================================================
-- 0010 — the DJ's own songs
--
-- Every row in song_requests until now came from a guest asking or the room
-- voting. A DJ had no way to put a song in their own queue: they could reorder
-- what guests sent and push a vote winner, but the track they wanted to open
-- with had to be typed into a guest's phone or played outside the app entirely.
--
-- No schema change is needed for it. A DJ-added song is a request like any
-- other, with no guest behind it — exactly the shape push_winner_to_queue
-- already produces, which is why this borrows its structure wholesale. What is
-- new is only who is allowed to create one directly.
--
-- It goes in as 'queued' rather than 'pending'. A request is pending because
-- someone has to approve it, and the person who would approve it is the person
-- who just added it.
-- ============================================================================

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

  -- Ended events take nothing further, by the same rule that closes them to
  -- guests. The DJ is not exempt from their own event being over.
  if v_event.status <> 'active' then
    raise exception 'invalid_input: this event has ended'
      using errcode = 'check_violation';
  end if;

  -- Named rather than anonymous: a guest scrolling the queue should be able to
  -- tell the DJ's own picks from the room's. The name is snapshotted into the
  -- request the same way a guest's is, so renaming the account later does not
  -- rewrite the history of a night.
  select display_name into v_dj_name
  from public.profiles where id = v_event.dj_id;

  insert into public.song_requests
    (event_id, guest_id, guest_display_name, title, artist, status,
     catalog_id, artwork_url, catalog_url)
  values
    (p_event_id, null,
     coalesce(nullif(btrim(v_dj_name), ''), 'DJ'),
     btrim(p_title),
     coalesce(btrim(p_artist), ''),
     'queued',
     p_catalog_id, p_artwork_url, p_catalog_url)
  returning * into v_request;

  -- queue_position is assigned by the same trigger that handles every other
  -- queued row, so a DJ song lands at the back like anything else.
  return v_request;
end;
$$;

grant execute on function public.add_dj_song(uuid, text, text, text, text, text)
  to authenticated;


-- >>> 0011_dj_sets.sql ====================================================

-- ============================================================================
-- 0011 — sets: the DJ's own crates of songs
--
-- Most of a night is the DJ's music. Requests are the point of the app, but
-- they arrive in ones and twos across an evening, and between them somebody has
-- to be playing something — which until now meant the DJ adding songs one at a
-- time, live, while also reading the room.
--
-- A set is a named list of songs the DJ builds beforehand and drops into a
-- queue in one go. It gives the night a spine that requests then sit on top of.
--
-- Owned by the DJ, not by an event. That is the whole value: a set built once
-- is the same set next Friday, and tying it to an event would mean rebuilding
-- it for every party. Loading it into a queue *copies* its songs into
-- song_requests, so editing a set afterwards never rewrites a night that has
-- already happened.
-- ============================================================================

create table if not exists public.dj_sets (
  id         uuid primary key default gen_random_uuid(),
  dj_id      uuid        not null references public.profiles (id) on delete cascade,
  name       text        not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dj_sets_dj_idx on public.dj_sets (dj_id, created_at desc);

comment on table public.dj_sets is
  'Reusable song lists owned by a DJ. Not scoped to an event — the point is to build one once and use it every night.';

create table if not exists public.dj_set_songs (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid    not null references public.dj_sets (id) on delete cascade,
  title         text    not null check (char_length(trim(title)) between 1 and 120),
  artist        text    not null default '',
  display_order integer not null default 0,
  -- Same catalogue trio every other song-bearing table carries, so a set song
  -- keeps its artwork and its identity when it becomes a queued request.
  catalog_id    text,
  artwork_url   text,
  catalog_url   text,
  created_at    timestamptz not null default now()
);

create index if not exists dj_set_songs_set_idx
  on public.dj_set_songs (set_id, display_order);

-- ---------------------------------------------------------------------------
-- Ownership. A set is private to its DJ — unlike events, which guests read.
-- ---------------------------------------------------------------------------
create or replace function public.owns_dj_set(target_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.dj_sets s
    where s.id = target_set_id and s.dj_id = auth.uid()
  );
$$;

alter table public.dj_sets      enable row level security;
alter table public.dj_set_songs enable row level security;

create policy dj_sets_select_own
  on public.dj_sets for select
  using (dj_id = auth.uid());

create policy dj_sets_insert_own
  on public.dj_sets for insert
  with check (dj_id = auth.uid());

create policy dj_sets_update_own
  on public.dj_sets for update
  using (dj_id = auth.uid())
  with check (dj_id = auth.uid());

create policy dj_sets_delete_own
  on public.dj_sets for delete
  using (dj_id = auth.uid());

create policy dj_set_songs_select_own
  on public.dj_set_songs for select
  using (public.owns_dj_set(set_id));

create policy dj_set_songs_insert_own
  on public.dj_set_songs for insert
  with check (public.owns_dj_set(set_id));

create policy dj_set_songs_update_own
  on public.dj_set_songs for update
  using (public.owns_dj_set(set_id))
  with check (public.owns_dj_set(set_id));

create policy dj_set_songs_delete_own
  on public.dj_set_songs for delete
  using (public.owns_dj_set(set_id));

-- ---------------------------------------------------------------------------
-- load_set_into_queue — the whole set, into one event's queue.
--
-- Copies rather than references. A queued song has to stand on its own: the
-- set can be renamed, reordered or deleted next week without disturbing a
-- night already played, and a request row that pointed at a set row would
-- either break or silently change under it.
--
-- Songs land at the back, in set order, as the DJ's own — guest_id null and no
-- source round, which is exactly what marks a song as the DJ's rather than the
-- room's. Requests are then kept ahead of them by the client, so a long set
-- never buries what the room asked for.
-- ---------------------------------------------------------------------------
create or replace function public.load_set_into_queue(
  p_event_id uuid,
  p_set_id   uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event   public.events;
  v_dj_name text;
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

  -- Owning the event is not owning the set; both are checked.
  if not public.owns_dj_set(p_set_id) then
    raise exception 'forbidden: that set belongs to someone else'
      using errcode = 'insufficient_privilege';
  end if;

  if v_event.status <> 'active' then
    raise exception 'invalid_input: this event has ended'
      using errcode = 'check_violation';
  end if;

  select display_name into v_dj_name
  from public.profiles where id = v_event.dj_id;

  insert into public.song_requests
    (event_id, guest_id, guest_display_name, title, artist, status,
     catalog_id, artwork_url, catalog_url)
  select
    p_event_id,
    null,
    coalesce(nullif(btrim(v_dj_name), ''), 'DJ'),
    s.title,
    s.artist,
    'queued',
    s.catalog_id,
    s.artwork_url,
    s.catalog_url
  from public.dj_set_songs s
  where s.set_id = p_set_id
  order by s.display_order, s.created_at;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

grant execute on function public.owns_dj_set(uuid) to authenticated;
grant execute on function public.load_set_into_queue(uuid, uuid) to authenticated;


-- >>> 0012_queue_groups.sql ===============================================

-- ============================================================================
-- 0012 — the queue in two halves
--
-- Keeping requests ahead of the DJ's songs worked by deriving the answer:
-- anything with no guest and no vote behind it was filler, and filler sorted
-- last. That rule could be *applied* but never *overridden* — a DJ who dragged
-- one of their own songs up found the next request landing above it and their
-- song pushed back down, because the rule recomputed the same answer every
-- time.
--
-- So which half a song belongs to becomes a fact stored about the song rather
-- than a conclusion drawn from it:
--
--   main — what plays next. Requests land at the end of it, as do songs the DJ
--          adds one at a time, and vote winners.
--   sub  — the backdrop. A loaded set goes here.
--
-- The DJ can move a song between the two, and it stays moved. That is the
-- whole point: promoting one track out of a set puts it above every request
-- that arrives afterwards, while still leaving it behind the requests already
-- waiting — which no derived rule could express.
--
-- Defaulting to 'main' is deliberate: every row that exists today was queued
-- under the old rule, where being in the queue at all meant being due to play.
-- ============================================================================

alter table public.song_requests
  add column if not exists queue_group text not null default 'main'
    check (queue_group in ('main', 'sub'));

comment on column public.song_requests.queue_group is
  'Which half of the queue this sits in. main plays first; sub is the backdrop a loaded set lands in. Stored rather than derived so the DJ can move a song and have it stay.';

-- Sorting is (group, position), and the queue is read on every screen.
create index if not exists song_requests_queue_group_idx
  on public.song_requests (event_id, queue_group, queue_position)
  where status = 'queued';

-- ---------------------------------------------------------------------------
-- set_queue_group — move one song between the halves.
--
-- Its own function rather than a column grant on update, because the guest
-- update policy already narrowly lists which columns a client may write and
-- widening it for this would open the same door to everyone.
-- ---------------------------------------------------------------------------
create or replace function public.set_queue_group(
  p_request_id uuid,
  p_group      text
)
returns public.song_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.song_requests;
begin
  if p_group not in ('main', 'sub') then
    raise exception 'invalid_input: unknown queue group'
      using errcode = 'check_violation';
  end if;

  select * into v_request from public.song_requests where id = p_request_id;
  if not found then
    raise exception 'not_found: request does not exist' using errcode = 'no_data_found';
  end if;

  if not public.is_event_owner(v_request.event_id) then
    raise exception 'forbidden: only the event owner can do this'
      using errcode = 'insufficient_privilege';
  end if;

  update public.song_requests
  set queue_group = p_group,
      updated_at  = now()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- reorder_queue — now also settles which half each song landed in.
--
-- The client sends one flat list of ids and says how many of them are in the
-- main half. Splitting it here rather than in two calls keeps a reorder a
-- single atomic write: a queue caught between the two would show songs in one
-- half and ordered by the other's numbering.
-- ---------------------------------------------------------------------------
-- Adding a parameter creates a *second* function rather than replacing the
-- first, and a two-argument call then matches both — the three-argument one
-- through its default — so Postgres refuses it as ambiguous. The old signature
-- has to go before the new one is defined.
drop function if exists public.reorder_queue(uuid, uuid[]);

create or replace function public.reorder_queue(
  p_event_id    uuid,
  p_request_ids uuid[],
  p_main_count  integer default null
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
  set queue_position = ordered.position - 1,
      -- Null means "leave the halves alone" — the old two-argument callers.
      queue_group = case
        when p_main_count is null then r.queue_group
        when ordered.position <= p_main_count then 'main'
        else 'sub'
      end
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
-- load_set_into_queue — a set is the backdrop, so it lands in the sub half.
-- ---------------------------------------------------------------------------
create or replace function public.load_set_into_queue(
  p_event_id uuid,
  p_set_id   uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event   public.events;
  v_dj_name text;
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
  order by s.display_order, s.created_at;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

grant execute on function public.set_queue_group(uuid, text) to authenticated;
grant execute on function public.reorder_queue(uuid, uuid[], integer) to authenticated;


-- >>> 0013_no_duplicate_songs.sql =========================================

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


-- >>> 0014_event_theme.sql ================================================

-- ============================================================================
-- 0014 — the room's colours
--
-- The DJ picks two colours in Event settings and everyone in the party sees
-- them. Guests already read the event row and already subscribe to changes on
-- it, so putting the theme here means it reaches every phone through machinery
-- that exists — no new table, no new subscription, and a colour change lands
-- on the room in the same beat as a now-playing change.
--
-- Two text columns rather than one jsonb blob so the shape can actually be
-- constrained: a check per column refuses anything that is not a hex colour,
-- which is worth more than the flexibility a blob would buy.
--
-- Only hue and saturation survive to the screen — the client rebuilds
-- lightness for every role so text stays legible whatever is stored here (see
-- src/features/theme/palette.ts). The database's job is only to say that this
-- is a colour at all.
-- ============================================================================

alter table public.events
  add column if not exists theme_primary text,
  add column if not exists theme_accent  text;

-- #rgb and #rrggbb, or nothing at all. Null means the app's own colours.
alter table public.events
  drop constraint if exists events_theme_primary_hex;
alter table public.events
  add constraint events_theme_primary_hex
  check (theme_primary is null or theme_primary ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');

alter table public.events
  drop constraint if exists events_theme_accent_hex;
alter table public.events
  add constraint events_theme_accent_hex
  check (theme_accent is null or theme_accent ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');

-- ---------------------------------------------------------------------------
-- Column privileges.
--
-- 0003 revoked UPDATE on events wholesale and granted it back column by column,
-- so a new column is unwritable until it is named here. RLS still decides the
-- rows: events_update_own already limits this to the event's own DJ.
-- ---------------------------------------------------------------------------
grant update (theme_primary, theme_accent) on public.events to authenticated;


-- >>> 0015_event_theme_background.sql =====================================

-- ============================================================================
-- 0015 — the page itself
--
-- 0014 stored the two accent colours; the surfaces underneath them were fixed.
-- This adds the third, and it is not a third accent: the whole surface ramp and
-- every piece of text on it are derived from this one colour, including whether
-- the app runs light text on dark or the other way up.
--
-- Same shape and same reasoning as 0014 — a text column with a hex check, null
-- meaning the app's own page. The client still rebuilds lightness for every
-- role, so what is stored only has to be a colour.
-- ============================================================================

alter table public.events
  add column if not exists theme_background text;

alter table public.events
  drop constraint if exists events_theme_background_hex;
alter table public.events
  add constraint events_theme_background_hex
  check (theme_background is null or theme_background ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');

grant update (theme_background) on public.events to authenticated;


-- >>> 0016_vote_conflict_and_guest_realtime.sql ===========================

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

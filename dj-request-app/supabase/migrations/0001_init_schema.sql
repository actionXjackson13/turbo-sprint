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

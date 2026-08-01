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

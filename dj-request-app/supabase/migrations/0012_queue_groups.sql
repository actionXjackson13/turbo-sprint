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

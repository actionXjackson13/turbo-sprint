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

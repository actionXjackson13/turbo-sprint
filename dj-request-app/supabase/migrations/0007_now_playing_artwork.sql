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

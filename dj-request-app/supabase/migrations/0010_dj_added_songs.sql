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

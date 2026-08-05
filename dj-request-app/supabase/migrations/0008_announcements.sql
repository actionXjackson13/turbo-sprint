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

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

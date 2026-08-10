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

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

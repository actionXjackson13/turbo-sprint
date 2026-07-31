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

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.song_requests;
alter publication supabase_realtime add table public.request_votes;
alter publication supabase_realtime add table public.voting_rounds;
alter publication supabase_realtime add table public.voting_options;
alter publication supabase_realtime add table public.voting_responses;

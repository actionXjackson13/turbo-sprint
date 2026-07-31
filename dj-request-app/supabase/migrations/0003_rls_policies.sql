-- ============================================================================
-- 0003_rls_policies.sql — row level security.
--
-- Model
-- -----
-- Every actor has a real, cryptographically verified `auth.uid()`:
--   * DJs sign in with email + password and own a row in `profiles`.
--   * Guests get an ANONYMOUS Supabase session (`signInAnonymously`), so a
--     guest identity is exactly as trustworthy inside these policies as a full
--     account. This is why guest identity is not a client-generated string —
--     a value the browser makes up could never be verified here, and the
--     policies below would degrade into rubber stamps.
--
-- Writes a client must not be trusted with have NO policy at all and go
-- through the SECURITY DEFINER functions in 0002 instead:
--   * creating a request (must also create the founding vote, and check
--     intake status, blocking and the active-request cap)
--   * joining an event (must not be able to forge another guest's row or
--     clear is_blocked)
--   * blocking a guest, ending/finalising a round, pushing a winner,
--     reordering the queue, setting now playing, ending an event
--
-- Note on `using (true)` for profiles/events SELECT: neither table holds
-- anything secret (a DJ display name, an event name and its join code). Guests
-- must read an event by code *before* they have any membership, so a
-- membership-scoped policy is impossible here. Email addresses and passwords
-- live in `auth.users`, which is never exposed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_all
  on public.profiles for select
  using (true);

create policy profiles_insert_self
  on public.profiles for insert
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create policy events_select_all
  on public.events for select
  using (true);

create policy events_insert_own
  on public.events for insert
  with check (dj_id = auth.uid());

create policy events_update_own
  on public.events for update
  using (dj_id = auth.uid())
  with check (dj_id = auth.uid());

create policy events_delete_own
  on public.events for delete
  using (dj_id = auth.uid());

-- ---------------------------------------------------------------------------
-- event_guests
--
-- Read-only for clients. All writes go through join_event / set_guest_blocked.
-- A guest sees only their own row; the DJ sees every guest at their event.
-- ---------------------------------------------------------------------------
create policy event_guests_select_self_or_owner
  on public.event_guests for select
  using (
    guest_user_id = auth.uid()
    or public.is_event_owner(event_id)
  );

-- ---------------------------------------------------------------------------
-- song_requests
--
-- Visible to everyone at the event. Inserts happen only via
-- create_song_request / push_winner_to_queue; status changes and deletion are
-- the DJ's alone. Guests therefore cannot change a status or touch vote_count.
-- ---------------------------------------------------------------------------
create policy song_requests_select_members
  on public.song_requests for select
  using (public.is_event_member(event_id));

create policy song_requests_update_owner
  on public.song_requests for update
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create policy song_requests_delete_owner
  on public.song_requests for delete
  using (public.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- request_votes
--
-- A guest may add and withdraw their own vote. Two things are enforced here
-- that the UI also shows but must not be relied on for:
--   * is_founding_vote must be false on any client insert, so a guest cannot
--     mint an unremovable vote; only create_song_request sets it true.
--   * a founding vote cannot be deleted, so a submitter cannot un-vote their
--     own request.
-- ---------------------------------------------------------------------------
create policy request_votes_select_members
  on public.request_votes for select
  using (public.is_event_member(public.request_event_id(request_id)));

create policy request_votes_insert_self
  on public.request_votes for insert
  with check (
    guest_id = public.current_guest_id(public.request_event_id(request_id))
    and is_founding_vote = false
    and not public.is_guest_blocked(public.request_event_id(request_id))
    and exists (
      select 1 from public.events e
      where e.id = public.request_event_id(request_id)
        and e.status = 'active'
    )
  );

create policy request_votes_delete_own
  on public.request_votes for delete
  using (
    guest_id = public.current_guest_id(public.request_event_id(request_id))
    and is_founding_vote = false
  );

-- ---------------------------------------------------------------------------
-- voting_rounds
-- ---------------------------------------------------------------------------
create policy voting_rounds_select_members
  on public.voting_rounds for select
  using (public.is_event_member(event_id));

create policy voting_rounds_insert_owner
  on public.voting_rounds for insert
  with check (public.is_event_owner(event_id));

create policy voting_rounds_update_owner
  on public.voting_rounds for update
  using (public.is_event_owner(event_id))
  with check (public.is_event_owner(event_id));

create policy voting_rounds_delete_owner
  on public.voting_rounds for delete
  using (public.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- voting_options
-- ---------------------------------------------------------------------------
create policy voting_options_select_members
  on public.voting_options for select
  using (public.is_event_member(public.round_event_id(round_id)));

create policy voting_options_insert_owner
  on public.voting_options for insert
  with check (public.is_event_owner(public.round_event_id(round_id)));

create policy voting_options_update_owner
  on public.voting_options for update
  using (public.is_event_owner(public.round_event_id(round_id)))
  with check (public.is_event_owner(public.round_event_id(round_id)));

create policy voting_options_delete_owner
  on public.voting_options for delete
  using (public.is_event_owner(public.round_event_id(round_id)));

-- ---------------------------------------------------------------------------
-- voting_responses
--
-- SELECT is granted to every member of the event, not just the ballot's owner.
-- That is a deliberate trade-off: Realtime only delivers change events for
-- rows the subscriber is allowed to read, so a private-ballot policy would
-- mean guests never saw the live totals the product requires. Ballots are not
-- sensitive here — they are song picks at a party, and the app shows aggregate
-- percentages rather than a per-guest breakdown.
--
-- Crucially, this is read-only exposure. The INSERT/UPDATE policies below
-- still pin `guest_id` to the caller, so no guest can cast or alter anyone
-- else's vote, and one-vote-per-round stays enforced by the unique index.
--
-- The `round_accepts_votes` check is the real deadline. It compares against
-- the database's own now(), so a client with a wrong or tampered clock cannot
-- vote after a round has expired, whether or not anyone has finalised it yet.
-- ---------------------------------------------------------------------------
create policy voting_responses_select_members
  on public.voting_responses for select
  using (public.is_event_member(public.round_event_id(round_id)));

create policy voting_responses_insert_self
  on public.voting_responses for insert
  with check (
    guest_id = public.current_guest_id(public.round_event_id(round_id))
    and public.round_accepts_votes(round_id)
    and not public.is_guest_blocked(public.round_event_id(round_id))
    -- The chosen option must belong to the round being voted in.
    and public.option_event_id(option_id) = public.round_event_id(round_id)
    and exists (
      select 1 from public.voting_options o
      where o.id = option_id and o.round_id = round_id
    )
  );

create policy voting_responses_update_own
  on public.voting_responses for update
  using (
    guest_id = public.current_guest_id(public.round_event_id(round_id))
    and public.round_accepts_votes(round_id)
  )
  with check (
    guest_id = public.current_guest_id(public.round_event_id(round_id))
    and public.round_accepts_votes(round_id)
    and exists (
      select 1 from public.voting_options o
      where o.id = option_id and o.round_id = round_id
    )
  );

-- ---------------------------------------------------------------------------
-- Column privileges.
--
-- RLS decides which rows are reachable; these decide which columns may be
-- written. Restricting song_requests UPDATE to the columns a DJ legitimately
-- changes means vote_count cannot be set directly even by the event owner —
-- it stays the trigger's to maintain.
-- ---------------------------------------------------------------------------
revoke update on public.song_requests from authenticated, anon;
grant  update (status, queue_position, updated_at)
  on public.song_requests to authenticated;

revoke update on public.events from authenticated, anon;
grant  update (name, request_status, now_playing_title, now_playing_artist,
               now_playing_request_id, status, ended_at)
  on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges. Only the RPCs the app actually calls are exposed;
-- the internal helpers stay callable because policies reference them.
-- ---------------------------------------------------------------------------
grant execute on function public.join_event(text, text)                 to authenticated;
grant execute on function public.create_event(text)                     to authenticated;
grant execute on function public.create_song_request(uuid, text, text)  to authenticated;
grant execute on function public.create_voting_round(uuid, jsonb, integer) to authenticated;
grant execute on function public.end_voting_round(uuid)                 to authenticated;
grant execute on function public.finalize_voting_round_if_expired(uuid) to authenticated;
grant execute on function public.push_winner_to_queue(uuid, uuid)       to authenticated;
grant execute on function public.reorder_queue(uuid, uuid[])            to authenticated;
grant execute on function public.set_guest_blocked(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_now_playing(uuid, text, text, uuid) to authenticated;
grant execute on function public.end_event(uuid)                        to authenticated;

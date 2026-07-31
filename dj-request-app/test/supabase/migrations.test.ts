import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Executes the real migration files against an in-process Postgres.
 *
 * This catches what a read-through cannot: syntax errors, wrong column or
 * function references, constraint definitions that don't hold, and trigger and
 * RPC logic that doesn't behave as intended.
 *
 * Two things are stubbed because they belong to the hosted platform rather
 * than to our schema:
 *   * `auth.users` and `auth.uid()` — replaced with a table and a function
 *     backed by a session setting, so policies can be exercised by "logging
 *     in" as different users.
 *   * `supabase_realtime` — created as an empty publication so 0004 applies.
 *
 * RLS is verified by connecting as a non-superuser role, because Postgres
 * exempts table owners and superusers from row level security.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

const read = (name: string) => readFileSync(join(MIGRATIONS, name), 'utf8')

let db: PGlite

/**
 * Runs one statement inside a transaction as the restricted `app_user` role
 * with a given auth.uid().
 *
 * `set local role` is transaction-scoped, so commit/rollback restores the
 * original role — no explicit reset is needed, and attempting one inside an
 * aborted transaction would mask the error we actually want to assert on.
 */
async function runAs<T = unknown>(
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[] }> {
  await db.exec('begin')
  try {
    await db.exec(`set local role app_user;`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      userId,
    ])
    const result = await db.query<T>(sql, params as never[])
    await db.exec('commit')
    return { rows: result.rows }
  } catch (err) {
    // Discard the aborted transaction, but surface the original failure.
    try {
      await db.exec('rollback')
    } catch {
      /* already rolled back */
    }
    throw err
  }
}

const DJ = '11111111-1111-4111-8111-111111111111'
const OTHER_DJ = '22222222-2222-4222-8222-222222222222'
const GUEST_A = '33333333-3333-4333-8333-333333333333'
const GUEST_B = '44444444-4444-4444-8444-444444444444'

let eventId: string
let guestARowId: string

describe('supabase migrations', () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } })

    // --- platform stubs -----------------------------------------------------
    await db.exec(`
      create schema if not exists auth;
      create table auth.users (
        id                 uuid primary key,
        email              text,
        is_anonymous       boolean not null default false,
        raw_user_meta_data jsonb   not null default '{}'::jsonb
      );

      -- Mirrors Supabase: the current user id comes from the JWT claim.
      create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      create role authenticated;
      create role anon;
      create role app_user;
      grant authenticated to app_user;

      create publication supabase_realtime;
    `)

    // --- the migrations under test -----------------------------------------
    await db.exec(read('0001_init_schema.sql'))
    await db.exec(read('0002_functions_triggers.sql'))
    await db.exec(read('0003_rls_policies.sql'))
    await db.exec(read('0004_realtime.sql'))

    // app_user stands in for a logged-in client; give it the same table
    // privileges Supabase grants `authenticated`.
    await db.exec(`
      grant usage on schema public to app_user;
      grant select, insert, update, delete
        on all tables in schema public to app_user;
      grant execute on all functions in schema public to app_user;
      -- Re-apply the column restriction from 0003 to app_user.
      revoke update on public.song_requests from app_user;
      grant update (status, queue_position, updated_at)
        on public.song_requests to app_user;
      revoke update on public.events from app_user;
      grant update (name, request_status, now_playing_title, now_playing_artist,
                    now_playing_request_id, status, ended_at)
        on public.events to app_user;
    `)

    // --- seed users (the trigger creates DJ profiles) -----------------------
    await db.query(
      `insert into auth.users (id, email, is_anonymous, raw_user_meta_data)
       values ($1, 'dj@example.com', false, '{"display_name":"DJ Nova"}'::jsonb)`,
      [DJ],
    )
    await db.query(
      `insert into auth.users (id, email, is_anonymous, raw_user_meta_data)
       values ($1, 'other@example.com', false, '{"display_name":"DJ Other"}'::jsonb)`,
      [OTHER_DJ],
    )
    await db.query(
      `insert into auth.users (id, is_anonymous) values ($1, true), ($2, true)`,
      [GUEST_A, GUEST_B],
    )
  })

  it('creates a profile for a DJ but not for an anonymous guest', async () => {
    const profiles = await db.query<{ id: string; display_name: string }>(
      `select id, display_name from public.profiles order by display_name`,
    )
    expect(profiles.rows.map((r) => r.display_name)).toEqual([
      'DJ Nova',
      'DJ Other',
    ])
  })

  it('normalize_song_text matches the client implementation', async () => {
    const cases: [string, string][] = [
      ['Dancing Queen', 'dancing queen'],
      ['  Get   Lucky  ', 'get lucky'],
      ["Don't Stop Believin'", 'don t stop believin'],
      ['Hello, World! (Remix)', 'hello world remix'],
      ['99 Problems', '99 problems'],
      ['   ', ''],
    ]
    for (const [input, expected] of cases) {
      const res = await db.query<{ out: string }>(
        `select public.normalize_song_text($1) as out`,
        [input],
      )
      expect(res.rows[0]!.out, `normalising ${JSON.stringify(input)}`).toBe(
        expected,
      )
    }
  })

  it('creates an event through the RPC with a generated code', async () => {
    const res = await runAs<{ id: string; code: string; dj_id: string }>(
      DJ,
      `select * from public.create_event('Summer Rooftop Party')`,
    )
    eventId = res.rows[0]!.id
    expect(res.rows[0]!.dj_id).toBe(DJ)
    expect(res.rows[0]!.code).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY34679]{4}$/)
  })

  it('lets guests join and rejoin without duplicating membership', async () => {
    const joined = await runAs<{ id: string; display_name: string }>(
      GUEST_A,
      `select * from public.join_event(
         (select code from public.events where id = $1), 'Alex')`,
      [eventId],
    )
    guestARowId = joined.rows[0]!.id
    expect(joined.rows[0]!.display_name).toBe('Alex')

    await runAs(
      GUEST_B,
      `select * from public.join_event(
         (select code from public.events where id = $1), 'Bailey')`,
      [eventId],
    )

    // Rejoining renames in place.
    const again = await runAs<{ id: string }>(
      GUEST_A,
      `select * from public.join_event(
         (select code from public.events where id = $1), 'Alexandra')`,
      [eventId],
    )
    expect(again.rows[0]!.id).toBe(guestARowId)

    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.event_guests where event_id = $1`,
      [eventId],
    )
    expect(count.rows[0]!.n).toBe(2)
  })

  it('creates a request with a founding vote and a vote_count of 1', async () => {
    const res = await runAs<{ id: string; vote_count: number; status: string }>(
      GUEST_A,
      `select * from public.create_song_request($1, '  Levitating ', 'Dua Lipa')`,
      [eventId],
    )
    expect(res.rows[0]!.vote_count).toBe(1)
    expect(res.rows[0]!.status).toBe('pending')

    const votes = await db.query<{ is_founding_vote: boolean }>(
      `select is_founding_vote from public.request_votes where request_id = $1`,
      [res.rows[0]!.id],
    )
    expect(votes.rows).toHaveLength(1)
    expect(votes.rows[0]!.is_founding_vote).toBe(true)
  })

  it('generates normalized columns for duplicate detection', async () => {
    const res = await db.query<{
      normalized_title: string
      normalized_artist: string
    }>(
      `select normalized_title, normalized_artist
       from public.song_requests where event_id = $1`,
      [eventId],
    )
    expect(res.rows[0]!.normalized_title).toBe('levitating')
    expect(res.rows[0]!.normalized_artist).toBe('dua lipa')
  })

  it('keeps vote_count in sync as votes are added and removed', async () => {
    const req = await db.query<{ id: string }>(
      `select id from public.song_requests where event_id = $1 limit 1`,
      [eventId],
    )
    const requestId = req.rows[0]!.id

    await runAs(
      GUEST_B,
      `insert into public.request_votes (request_id, guest_id)
       values ($1, public.current_guest_id($2))`,
      [requestId, eventId],
    )
    let count = await db.query<{ vote_count: number }>(
      `select vote_count from public.song_requests where id = $1`,
      [requestId],
    )
    expect(count.rows[0]!.vote_count).toBe(2)

    await runAs(
      GUEST_B,
      `delete from public.request_votes
       where request_id = $1 and guest_id = public.current_guest_id($2)`,
      [requestId, eventId],
    )
    count = await db.query<{ vote_count: number }>(
      `select vote_count from public.song_requests where id = $1`,
      [requestId],
    )
    expect(count.rows[0]!.vote_count).toBe(1)
  })

  it('refuses to let a guest delete their founding vote', async () => {
    const req = await db.query<{ id: string }>(
      `select id from public.song_requests where event_id = $1 limit 1`,
      [eventId],
    )
    // The policy simply matches no rows, so the vote survives.
    await runAs(
      GUEST_A,
      `delete from public.request_votes
       where request_id = $1 and guest_id = public.current_guest_id($2)`,
      [req.rows[0]!.id, eventId],
    )
    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.request_votes where request_id = $1`,
      [req.rows[0]!.id],
    )
    expect(count.rows[0]!.n).toBe(1)
  })

  it('refuses a client-inserted founding vote', async () => {
    const req = await db.query<{ id: string }>(
      `select id from public.song_requests where event_id = $1 limit 1`,
      [eventId],
    )
    await expect(
      runAs(
        GUEST_B,
        `insert into public.request_votes (request_id, guest_id, is_founding_vote)
         values ($1, public.current_guest_id($2), true)`,
        [req.rows[0]!.id, eventId],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('enforces the five-active-request cap', async () => {
    for (let i = 1; i < 5; i++) {
      await runAs(
        GUEST_A,
        `select * from public.create_song_request($1, $2, 'Artist')`,
        [eventId, `Song ${i}`],
      )
    }
    await expect(
      runAs(
        GUEST_A,
        `select * from public.create_song_request($1, 'One Too Many', 'Artist')`,
        [eventId],
      ),
    ).rejects.toThrow(/limit_reached/)
  })

  it('refuses requests while intake is paused', async () => {
    await runAs(
      DJ,
      `update public.events set request_status = 'paused' where id = $1`,
      [eventId],
    )
    await expect(
      runAs(
        GUEST_B,
        `select * from public.create_song_request($1, 'Anything', 'Someone')`,
        [eventId],
      ),
    ).rejects.toThrow(/requests_closed/)

    await runAs(
      DJ,
      `update public.events set request_status = 'open' where id = $1`,
      [eventId],
    )
  })

  it('refuses requests from a blocked guest', async () => {
    await runAs(DJ, `select public.set_guest_blocked($1, $2, true)`, [
      eventId,
      guestARowId,
    ])
    await expect(
      runAs(
        GUEST_A,
        `select * from public.create_song_request($1, 'Blocked Song', 'Artist')`,
        [eventId],
      ),
    ).rejects.toThrow(/blocked/)

    await runAs(DJ, `select public.set_guest_blocked($1, $2, false)`, [
      eventId,
      guestARowId,
    ])
  })

  it('stops a guest from blocking themselves or others', async () => {
    await expect(
      runAs(GUEST_A, `select public.set_guest_blocked($1, $2, true)`, [
        eventId,
        guestARowId,
      ]),
    ).rejects.toThrow(/forbidden/)
  })

  it('stops a guest from changing a request status', async () => {
    const req = await db.query<{ id: string }>(
      `select id from public.song_requests where event_id = $1 limit 1`,
      [eventId],
    )
    await runAs(
      GUEST_B,
      `update public.song_requests set status = 'queued' where id = $1`,
      [req.rows[0]!.id],
    )
    const after = await db.query<{ status: string }>(
      `select status from public.song_requests where id = $1`,
      [req.rows[0]!.id],
    )
    // The row is invisible to the UPDATE policy, so nothing changed.
    expect(after.rows[0]!.status).toBe('pending')
  })

  it('stops even the owning DJ from writing vote_count directly', async () => {
    const req = await db.query<{ id: string }>(
      `select id from public.song_requests where event_id = $1 limit 1`,
      [eventId],
    )
    await expect(
      runAs(
        DJ,
        `update public.song_requests set vote_count = 999 where id = $1`,
        [req.rows[0]!.id],
      ),
    ).rejects.toThrow(/permission denied|column/i)
  })

  it('stops another DJ from managing this event', async () => {
    await runAs(
      OTHER_DJ,
      `update public.events set request_status = 'closed' where id = $1`,
      [eventId],
    )
    const after = await db.query<{ request_status: string }>(
      `select request_status from public.events where id = $1`,
      [eventId],
    )
    expect(after.rows[0]!.request_status).toBe('open')
  })

  it('assigns and clears queue_position as status changes', async () => {
    const req = await db.query<{ id: string }>(
      `select id from public.song_requests where event_id = $1
       order by created_at limit 1`,
      [eventId],
    )
    const id = req.rows[0]!.id

    await runAs(DJ, `update public.song_requests set status='queued' where id=$1`, [id])
    let row = await db.query<{ queue_position: number | null }>(
      `select queue_position from public.song_requests where id = $1`,
      [id],
    )
    expect(row.rows[0]!.queue_position).toBe(0)

    await runAs(DJ, `update public.song_requests set status='played' where id=$1`, [id])
    row = await db.query<{ queue_position: number | null }>(
      `select queue_position from public.song_requests where id = $1`,
      [id],
    )
    expect(row.rows[0]!.queue_position).toBeNull()
  })

  describe('voting rounds', () => {
    let roundId: string
    let optionIds: string[]

    it('creates a round with options via the RPC', async () => {
      const res = await runAs<{ create_voting_round: string }>(
        DJ,
        `select public.create_voting_round($1, $2::jsonb, 120)`,
        [
          eventId,
          JSON.stringify([
            { title: 'September', artist: 'Earth, Wind & Fire' },
            { title: 'Titanium', artist: 'David Guetta' },
          ]),
        ],
      )
      roundId = res.rows[0]!.create_voting_round

      const options = await db.query<{ id: string }>(
        `select id from public.voting_options where round_id = $1
         order by display_order`,
        [roundId],
      )
      optionIds = options.rows.map((r) => r.id)
      expect(optionIds).toHaveLength(2)
    })

    it('rejects fewer than two or more than four options', async () => {
      await expect(
        runAs(DJ, `select public.create_voting_round($1, $2::jsonb, null)`, [
          eventId,
          JSON.stringify([{ title: 'Only One', artist: 'X' }]),
        ]),
      ).rejects.toThrow(/invalid_input/)
    })

    it('allows only one active round per event', async () => {
      await expect(
        runAs(DJ, `select public.create_voting_round($1, $2::jsonb, null)`, [
          eventId,
          JSON.stringify([
            { title: 'A', artist: 'X' },
            { title: 'B', artist: 'Y' },
          ]),
        ]),
      ).rejects.toThrow(/duplicate key|unique/i)
    })

    it('records a vote and moves it rather than adding one on change', async () => {
      await runAs(
        GUEST_A,
        `insert into public.voting_responses (round_id, option_id, guest_id)
         values ($1, $2, public.current_guest_id($3))`,
        [roundId, optionIds[0], eventId],
      )
      await runAs(
        GUEST_A,
        `update public.voting_responses set option_id = $2
         where round_id = $1 and guest_id = public.current_guest_id($3)`,
        [roundId, optionIds[1], eventId],
      )

      const rows = await db.query<{ option_id: string }>(
        `select option_id from public.voting_responses where round_id = $1`,
        [roundId],
      )
      expect(rows.rows).toHaveLength(1)
      expect(rows.rows[0]!.option_id).toBe(optionIds[1])
    })

    it('exposes aggregate tallies through the view', async () => {
      await runAs(
        GUEST_B,
        `insert into public.voting_responses (round_id, option_id, guest_id)
         values ($1, $2, public.current_guest_id($3))`,
        [roundId, optionIds[1], eventId],
      )
      const tallies = await db.query<{ option_id: string; votes: number }>(
        `select option_id, votes from public.voting_round_tallies
         where round_id = $1 order by votes desc`,
        [roundId],
      )
      expect(tallies.rows[0]!.votes).toBe(2)
      expect(tallies.rows[0]!.option_id).toBe(optionIds[1])
    })

    it('stops a guest voting on behalf of another guest', async () => {
      // An UPDATE that a USING clause rejects matches no rows rather than
      // raising, so the assertion is that the other guest's ballot is intact.
      await runAs(
        GUEST_A,
        `update public.voting_responses set option_id = $2
         where round_id = $1 and guest_id <> public.current_guest_id($3)`,
        [roundId, optionIds[0], eventId],
      )

      const guestBGuestId = await db.query<{ id: string }>(
        `select id from public.event_guests
         where event_id = $1 and guest_user_id = $2`,
        [eventId, GUEST_B],
      )
      const ballot = await db.query<{ option_id: string }>(
        `select option_id from public.voting_responses
         where round_id = $1 and guest_id = $2`,
        [roundId, guestBGuestId.rows[0]!.id],
      )
      expect(ballot.rows[0]!.option_id).toBe(optionIds[1])
    })

    it('rejects votes once the round has expired, by the server clock', async () => {
      // Move the deadline into the past without touching status — exactly the
      // window between expiry and finalisation that the policy must defend.
      await db.query(
        `update public.voting_rounds set ends_at = now() - interval '1 minute'
         where id = $1`,
        [roundId],
      )

      // Changing an existing vote silently matches nothing.
      await runAs(
        GUEST_A,
        `update public.voting_responses set option_id = $2
         where round_id = $1 and guest_id = public.current_guest_id($3)`,
        [roundId, optionIds[0], eventId],
      )
      const guestAGuestId = await db.query<{ id: string }>(
        `select id from public.event_guests
         where event_id = $1 and guest_user_id = $2`,
        [eventId, GUEST_A],
      )
      const ballot = await db.query<{ option_id: string }>(
        `select option_id from public.voting_responses
         where round_id = $1 and guest_id = $2`,
        [roundId, guestAGuestId.rows[0]!.id],
      )
      expect(ballot.rows[0]!.option_id).toBe(optionIds[1])

      // A first-time vote after expiry violates WITH CHECK, which does raise.
      await db.query(
        `delete from public.voting_responses where round_id = $1 and guest_id = $2`,
        [roundId, guestAGuestId.rows[0]!.id],
      )
      await expect(
        runAs(
          GUEST_A,
          `insert into public.voting_responses (round_id, option_id, guest_id)
           values ($1, $2, public.current_guest_id($3))`,
          [roundId, optionIds[0], eventId],
        ),
      ).rejects.toThrow(/row-level security/i)
    })

    it('finalises an expired round and resolves the winner', async () => {
      const res = await runAs<{ status: string; winner_option_id: string }>(
        GUEST_A,
        `select * from public.finalize_voting_round_if_expired($1)`,
        [roundId],
      )
      expect(res.rows[0]!.status).toBe('ended')
      expect(res.rows[0]!.winner_option_id).toBe(optionIds[1])
    })

    it('pushes the winner into the queue as an unowned request', async () => {
      const res = await runAs<{
        status: string
        guest_id: string | null
        source_round_id: string
      }>(DJ, `select * from public.push_winner_to_queue($1, $2)`, [
        roundId,
        optionIds[1],
      ])
      expect(res.rows[0]!.status).toBe('queued')
      expect(res.rows[0]!.guest_id).toBeNull()
      expect(res.rows[0]!.source_round_id).toBe(roundId)
    })

    it('stops a guest pushing a winner', async () => {
      await expect(
        runAs(GUEST_A, `select * from public.push_winner_to_queue($1, $2)`, [
          roundId,
          optionIds[0],
        ]),
      ).rejects.toThrow(/forbidden/)
    })
  })

  it('ends an event and cancels any running round', async () => {
    await runAs(DJ, `select public.create_voting_round($1, $2::jsonb, null)`, [
      eventId,
      JSON.stringify([
        { title: 'A', artist: 'X' },
        { title: 'B', artist: 'Y' },
      ]),
    ])

    const res = await runAs<{ status: string; request_status: string }>(
      DJ,
      `select * from public.end_event($1)`,
      [eventId],
    )
    expect(res.rows[0]!.status).toBe('ended')
    expect(res.rows[0]!.request_status).toBe('closed')

    const active = await db.query<{ n: number }>(
      `select count(*)::int as n from public.voting_rounds
       where event_id = $1 and status = 'active'`,
      [eventId],
    )
    expect(active.rows[0]!.n).toBe(0)
  })
})

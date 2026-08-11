import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The file that actually gets pasted into Supabase.
 *
 * migrations.test.ts applies the migrations one by one, which is how they run
 * in development. Setting up a project is a different act: one paste of one
 * generated file into a SQL editor in a browser. That file is the artifact a
 * working party depends on, so it is the artifact worth testing — a bundle
 * that drifted from its sources, or that fell over halfway through, would
 * leave a half-built database and a very confusing evening.
 */

const SCHEMA = join(process.cwd(), 'supabase', 'schema.sql')

/** Everything Supabase provides that our SQL expects to already be there. */
async function platformStubs(db: PGlite) {
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (
      id                 uuid primary key,
      email              text,
      is_anonymous       boolean not null default false,
      raw_user_meta_data jsonb   not null default '{}'::jsonb
    );
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create role authenticated;
    create role anon;
    create publication supabase_realtime;
  `)
}

describe('the generated schema bundle', () => {
  let sql: string

  beforeAll(() => {
    // Rebuild first: a stale committed bundle is exactly the failure this is
    // here to catch, and regenerating makes the test compare sources to output
    // rather than trusting whatever was committed last.
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'scripts', 'build-schema.mjs')],
      { stdio: 'pipe' },
    )
    sql = readFileSync(SCHEMA, 'utf8')
  })

  it('carries every migration', () => {
    const listed = [...sql.matchAll(/^-- >>> (\d{4}_[a-z_]+\.sql)/gm)].map(
      (m) => m[1],
    )
    expect(listed.length).toBe(15)
    expect(listed).toEqual([...listed].sort())
    expect(listed[0]).toBe('0001_init_schema.sql')
  })

  it('builds a working database in one run', async () => {
    const db = new PGlite({ extensions: { pgcrypto, pg_trgm } })
    await platformStubs(db)
    await db.exec(sql)

    const tables = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public'`,
    )
    expect(tables.rows[0]!.n).toBeGreaterThanOrEqual(10)

    // A representative slice of what the client calls, so a bundle missing a
    // later migration fails here rather than at a party.
    const functions = await db.query<{ proname: string }>(
      `select proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`,
    )
    const names = new Set(functions.rows.map((r) => r.proname))
    for (const required of [
      'create_event',
      'join_event',
      'create_song_request',
      'add_dj_song',
      'load_set_into_queue',
      'reorder_queue',
      'set_now_playing',
      'find_similar_request',
    ]) {
      expect(names.has(required), required).toBe(true)
    }

    // The newest columns, which is where a stale bundle shows up first.
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'events'`,
    )
    const eventColumns = new Set(columns.rows.map((r) => r.column_name))
    expect(eventColumns.has('theme_primary')).toBe(true)
    expect(eventColumns.has('theme_background')).toBe(true)

    await db.close()
  }, 60_000)

  /**
   * People paste twice — after an error, to pick up a change, or because they
   * are not sure the first one took. The migrations create tables outright, so
   * a second run cannot succeed; what it must not do is fail somewhere in the
   * middle and leave half a database behind.
   */
  it('stops a second run before it changes anything', async () => {
    const db = new PGlite({ extensions: { pgcrypto, pg_trgm } })
    await platformStubs(db)
    await db.exec(sql)

    await expect(db.exec(sql)).rejects.toThrow(/already installed/i)

    // And the first install is untouched.
    const events = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables
       where schemaname = 'public' and tablename = 'events'`,
    )
    expect(events.rows[0]!.n).toBe(1)
    await db.close()
  }, 90_000)
})

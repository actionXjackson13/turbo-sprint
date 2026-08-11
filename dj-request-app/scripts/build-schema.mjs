/**
 * Concatenates the migrations into one file to paste into Supabase's SQL
 * editor.
 *
 * The migrations are the source of truth and stay separate — each one is a
 * readable account of a single change, and the test suite applies them in
 * order against a real Postgres. But setting up a project is a one-off job
 * done in a browser, and "install a CLI, link a project, run a command" is a
 * lot of ceremony to run fifteen files once. This is those fifteen files, in
 * order, in the order they must run.
 *
 * Generated rather than maintained by hand so it cannot drift: `npm run
 * schema` rebuilds it, and a test applies *this file* rather than the
 * migrations, so what gets pasted is what was tested.
 *
 * The bundle is not idempotent — the migrations create tables and policies
 * outright, as migrations should — so it opens with a guard. Running it twice
 * stops immediately with an explanation instead of failing somewhere in the
 * middle and leaving half a database behind, which is the version of this that
 * ruins an evening.
 *
 * Usage: npm run schema
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const APP_DIR = resolve(import.meta.dirname, '..')
const MIGRATIONS = join(APP_DIR, 'supabase', 'migrations')
const OUT = join(APP_DIR, 'supabase', 'schema.sql')

const files = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql'))
  .sort()

const header = `-- ============================================================================
-- SoundBoard — complete database schema
--
-- GENERATED FILE. Do not edit: run \`npm run schema\` after changing anything
-- in supabase/migrations, which is where these actually live.
--
-- To set up a Supabase project: open the SQL Editor, paste this whole file,
-- and run it. Run it once, on a fresh project — it stops with instructions if
-- the schema is already there.
--
-- Built from ${files.length} migrations:
${files.map((f) => `--   ${f}`).join('\n')}
-- ============================================================================

`

/**
 * Refuses to run over an existing install, and says what to do instead.
 * Lives here rather than in a migration because the migrations are applied one
 * at a time in development, where this would be in the way.
 */
const guard = `-- ---------------------------------------------------------------------------
-- Already installed?
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'profiles'
  ) then
    raise exception using
      message = 'SoundBoard is already installed on this project. Nothing was changed.',
      hint = 'To rebuild from scratch, run these three lines and then paste this file again: '
             'drop schema public cascade; create schema public; '
             'grant usage on schema public to anon, authenticated, service_role;';
  end if;
end $$;

`

const body = files
  .map(
    (name) =>
      `-- >>> ${name} ${'='.repeat(Math.max(0, 68 - name.length))}\n\n` +
      readFileSync(join(MIGRATIONS, name), 'utf8').trimEnd() +
      '\n',
  )
  .join('\n\n')

writeFileSync(OUT, header + guard + body)
console.log(`Wrote ${OUT} from ${files.length} migrations.`)

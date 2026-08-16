/**
 * Flattens the edge function into one file to paste into Supabase.
 *
 * The function is written as two: `parse.ts` holds the pure playlist reading
 * and is what the test suite exercises, `handler.ts` holds the Deno request
 * plumbing that cannot be tested here. That split is right for the code and
 * wrong for the deploy — Supabase's in-browser editor starts you with a single
 * `index.ts`, and adding a second file beside it is a fiddly step that fails
 * with "Module not found" if it is missed or misnamed.
 *
 * So the deployable artifact is one file: the parser, then the handler with its
 * import of the parser removed. Same reasoning as the schema bundle. Generated
 * rather than hand-maintained so it cannot drift from the sources, and a test
 * checks the output rather than trusting it.
 *
 * Usage: npm run function
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DIR = resolve(import.meta.dirname, '..', 'supabase', 'functions', 'import-playlist')

const parse = readFileSync(join(DIR, 'parse.ts'), 'utf8').trimEnd()
const handler = readFileSync(join(DIR, 'handler.ts'), 'utf8')

/**
 * The one line that has to go: with both halves in the same file there is
 * nothing left to import, and a relative import is exactly what fails to
 * resolve when only this file is deployed.
 */
const body = handler
  .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/parse\.ts'\r?\n/m, '')
  .replace(/^\/\/ @ts-nocheck[^\n]*\r?\n/m, '')
  .trimStart()

const out = `// @ts-nocheck — this file runs on Deno inside Supabase, not in the app build.
//
// GENERATED FILE. Do not edit: run \`npm run function\` after changing
// parse.ts or handler.ts in this directory, which is where this actually lives.
//
// It is one file on purpose. Supabase's in-browser editor gives you a single
// index.ts, and this is meant to be pasted into it whole — nothing else to add,
// nothing to name correctly, no second file to forget.

${parse}

// ---------------------------------------------------------------------------
// The request handler
// ---------------------------------------------------------------------------

${body}`

writeFileSync(join(DIR, 'index.ts'), out)
console.log(`Wrote ${join(DIR, 'index.ts')} (${out.split('\n').length} lines).`)

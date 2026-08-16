import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The file that actually gets pasted into Supabase.
 *
 * The function is written as two — a pure parser the tests exercise, and Deno
 * plumbing they cannot — but it is *deployed* as one, because the in-browser
 * editor starts you with a single index.ts and a second file beside it is a
 * step that gets missed. It was missed the first time, and the deploy failed
 * with "Module not found".
 *
 * So the flattened file is the artifact a working import depends on, and it is
 * the artifact worth checking: still self-contained, still carrying both
 * halves, still matching the sources it was built from.
 */

const DIR = join(process.cwd(), 'supabase', 'functions', 'import-playlist')

describe('the deployable edge function', () => {
  let bundled: string

  beforeAll(() => {
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'scripts', 'build-function.mjs')],
      { stdio: 'pipe' },
    )
    bundled = readFileSync(join(DIR, 'index.ts'), 'utf8')
  })

  /** The failure this file exists to prevent, stated directly. */
  it('imports nothing from alongside it', () => {
    expect(bundled).not.toMatch(/from\s+'\.\/[^']*'/)
    expect(bundled).not.toMatch(/from\s+"\.\/[^"]*"/)
  })

  it('carries the parser and the handler', () => {
    expect(bundled).toContain('export function parsePlaylist')
    expect(bundled).toContain('export function playlistUrl')
    expect(bundled).toContain('Deno.serve')
  })

  it('keeps the allowlist that stops it fetching anything it is told to', () => {
    expect(bundled).toContain("url.hostname !== 'music.apple.com'")
    expect(bundled).toContain("url.protocol !== 'https:'")
  })

  it('is exactly what its sources build to', () => {
    const committed = bundled
    execFileSync(
      process.execPath,
      [join(process.cwd(), 'scripts', 'build-function.mjs')],
      { stdio: 'pipe' },
    )
    expect(readFileSync(join(DIR, 'index.ts'), 'utf8')).toBe(committed)
  })

  it('says it is generated, so nobody edits it in place', () => {
    expect(bundled).toContain('GENERATED FILE')
  })
})

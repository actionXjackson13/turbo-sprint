/**
 * Publishes the app into the repo's GitHub Pages site.
 *
 * Pages serves this repository from the master branch root, where an unrelated
 * project already lives, so the built app is copied into a `dj/` directory at
 * the repo root and committed. That keeps the existing site working and needs
 * no change to the Pages configuration.
 *
 * Usage: npm run deploy   (then commit and push the dj/ directory)
 */
import { execFileSync } from 'node:child_process'
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const APP_DIR = resolve(import.meta.dirname, '..')
const REPO_ROOT = resolve(APP_DIR, '..')
const OUT_DIR = join(REPO_ROOT, 'dj')
const DIST_DIR = join(APP_DIR, 'dist')

/** Must match where Pages serves this directory from. */
const BASE = '/turbo-sprint/dj/'

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  })

console.log(`Building with base ${BASE} ...`)
run('npm', ['run', 'build'], {
  cwd: APP_DIR,
  env: { ...process.env, DEPLOY_BASE: BASE },
})

if (!existsSync(DIST_DIR)) {
  console.error('Build produced no dist/ directory.')
  process.exit(1)
}

console.log(`Publishing to ${OUT_DIR} ...`)
// Replace wholesale so files deleted from a build don't linger on the site.
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
cpSync(DIST_DIR, OUT_DIR, { recursive: true })

console.log('\nDone. Commit and push to publish:')
console.log('  git add dj && git commit -m "Redeploy SoundBoard" && git push')

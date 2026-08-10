import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Opening today's app on yesterday's saved data.
 *
 * The demo database lives in localStorage and outlives the code that wrote it.
 * Someone who used the app last week reloads it today and gets last week's
 * *shape* back — every collection added since is simply missing, and the first
 * write to one throws.
 *
 * This is not hypothetical: sets shipped broken for exactly this reason. On a
 * fresh browser everything worked, so every test and every manual check passed;
 * on a browser that had opened the app before, `djSets` was undefined and
 * naming a new set failed with "something went wrong". The gap was that nothing
 * ever loaded an *older* database.
 */

const STORAGE_KEY = 'soundboard.demoDb.v2'

/** A database as it was stored before sets existed. Deliberately has no djSets. */
function legacyDb() {
  return {
    profiles: [
      { id: 'dj-1', displayName: 'DJ Nova', createdAt: new Date().toISOString() },
    ],
    events: [
      {
        id: 'event-1',
        djId: 'dj-1',
        djDisplayName: 'DJ Nova',
        name: 'Old Party',
        code: 'PLAY',
        status: 'active',
        requestStatus: 'open',
        nowPlaying: null,
        announcement: null,
        createdAt: new Date().toISOString(),
        endedAt: null,
      },
    ],
    guests: [],
    requests: [],
    requestVotes: [],
    rounds: [],
    votingOptions: [],
    votingResponses: [],
    currentDjId: 'dj-1',
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('loading a database saved by an older version', () => {
  it('fills in collections that did not exist yet', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyDb()))

    const { getDb } = await import('../../src/services/demo/demoStore')
    expect(Array.isArray(getDb().djSets)).toBe(true)
  })

  /** The actual failure a DJ hit: naming a set threw instead of saving. */
  it('can create a set on a database that had none', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyDb()))

    const { DemoService } = await import('../../src/services/demo/DemoService')
    const service = new DemoService()

    const set = await service.createDjSet('Warm-up')
    expect(set.name).toBe('Warm-up')
    expect(await service.listDjSets()).toHaveLength(1)
  })

  /**
   * Repairing rather than rejecting is the whole point. Bumping the storage key
   * would have been simpler and would have wiped a live party — its event, its
   * requests, its guests and its queue — to add a feature nobody had used yet.
   */
  it('keeps the party that was already there', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyDb()))

    const { getDb } = await import('../../src/services/demo/demoStore')
    const db = getDb()

    expect(db.events).toHaveLength(1)
    expect(db.events[0]!.name).toBe('Old Party')
    expect(db.currentDjId).toBe('dj-1')
  })

  /**
   * Sign-in identities arrived long after this format did, so an older
   * database has no accounts at all. The sample DJ has to stay reachable —
   * otherwise the fix for signing in as yourself locks out the one account
   * everybody has.
   */
  it('leaves the sample DJ able to sign in', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyDb()))

    const { getDb } = await import('../../src/services/demo/demoStore')
    const { DEMO_DJ_EMAIL } = await import('../../src/services/demo/seed')

    const db = getDb()
    expect(db.accounts.length).toBeGreaterThan(0)
    expect(db.accounts.map((a) => a.email)).toContain(DEMO_DJ_EMAIL)
  })

  it('still falls back to a fresh seed for something that is not a database', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nonsense: true }))

    const { getDb } = await import('../../src/services/demo/demoStore')
    // The seed has its own event, so this is recognisably not the stored value.
    expect(getDb().events.length).toBeGreaterThan(0)
    expect(Array.isArray(getDb().djSets)).toBe(true)
  })
})

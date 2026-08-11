import { beforeEach, describe, expect, it } from 'vitest'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
} from '../../src/services/demo/seed'
import { ServiceError } from '../../src/services/types'
import {
  adoptDemoProfile,
  listDemoDjAccounts,
} from '../../src/services/demo/demoAuth'

/**
 * Signing in as yourself.
 *
 * Demo mode has no server and stores no password, which is fine — but it also
 * stored no *email*, and sign-in fell back to "whoever is already signed in,
 * or else the first profile in the database". After signing out that is always
 * the seeded sample DJ, so a DJ who made their own account was handed DJ Nova
 * every time and could never get back into their own.
 */

describe('demo accounts', () => {
  let service: DemoService

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
  })

  it('signs the sample DJ in with the credentials on the sign-in screen', async () => {
    const profile = await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    expect(profile.displayName).toBe('DJ Nova')
  })

  /** The bug, stated directly. */
  it('signs a DJ back into the account they created, not the sample one', async () => {
    const created = await service.signUpDj(
      'mine@example.com',
      'hunter2!',
      'DJ Mine',
    )
    await service.signOutDj()

    const back = await service.signInDj('mine@example.com', 'hunter2!')
    expect(back.id).toBe(created.id)
    expect(back.displayName).toBe('DJ Mine')
  })

  it('keeps two accounts on one device apart', async () => {
    const a = await service.signUpDj('a@example.com', 'password', 'DJ A')
    await service.signOutDj()
    const b = await service.signUpDj('b@example.com', 'password', 'DJ B')
    await service.signOutDj()

    expect((await service.signInDj('a@example.com', 'password')).id).toBe(a.id)
    expect((await service.signInDj('b@example.com', 'password')).id).toBe(b.id)
  })

  /**
   * The fallback that caused all of this. An email nobody has used must fail
   * rather than quietly hand over whichever account happened to be first.
   */
  it('refuses an email with no account behind it', async () => {
    await expect(
      service.signInDj('nobody@example.com', 'password'),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('still refuses after a sign-out, when nobody is current', async () => {
    await service.signUpDj('mine@example.com', 'password', 'DJ Mine')
    await service.signOutDj()

    await expect(
      service.signInDj('someone-else@example.com', 'password'),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('does not mind how the email was typed', async () => {
    const created = await service.signUpDj('Me@Example.com ', 'password', 'DJ')
    await service.signOutDj()

    const back = await service.signInDj('  me@example.COM', 'password')
    expect(back.id).toBe(created.id)
  })

  it('refuses a second account on the same email', async () => {
    await service.signUpDj('taken@example.com', 'password', 'First')
    await expect(
      service.signUpDj('taken@example.com', 'password', 'Second'),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('refuses a password shorter than the real backend would accept', async () => {
    await expect(
      service.signUpDj('short@example.com', 'abc', 'DJ Short'),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('leaves the new account signed in after signing up', async () => {
    const created = await service.signUpDj('new@example.com', 'password', 'DJ New')
    expect((await service.getCurrentDjProfile())?.id).toBe(created.id)
  })

  it('signs nobody in after signing out', async () => {
    await service.signUpDj('new@example.com', 'password', 'DJ New')
    await service.signOutDj()
    expect(await service.getCurrentDjProfile()).toBeNull()
  })

  /**
   * Identity has to reach the data, not just the profile object — an event
   * created by one DJ must not turn up on another's dashboard.
   */
  it('keeps each DJ’s events to themselves', async () => {
    await service.signUpDj('a@example.com', 'password', 'DJ A')
    await service.createEvent('A’s party')
    await service.signOutDj()

    await service.signUpDj('b@example.com', 'password', 'DJ B')
    const theirs = await service.getDjEvents()
    expect(theirs.map((e) => e.name)).not.toContain('A’s party')

    await service.signOutDj()
    await service.signInDj('a@example.com', 'password')
    expect((await service.getDjEvents()).map((e) => e.name)).toContain(
      'A’s party',
    )
  })

  /**
   * The way back in when the email is the thing that has been lost.
   *
   * A demo account lives in this browser and nowhere else: no password is
   * checked, no reset can be sent. Without a list of what is on the device, a
   * half-remembered email is permanent.
   */
  describe('the accounts on this device', () => {
    it('lists the sample DJ with the email that signs it in', async () => {
      const accounts = listDemoDjAccounts()
      expect(accounts).toHaveLength(1)
      expect(accounts[0]!.email).toBe(DEMO_DJ_EMAIL)
    })

    it('lists an account made here, newest first', async () => {
      await service.signUpDj('mine@example.com', 'password', 'DJ Mine')

      const accounts = listDemoDjAccounts()
      expect(accounts.map((a) => a.profile.displayName)).toEqual([
        'DJ Mine',
        'DJ Nova',
      ])
      expect(accounts[0]!.email).toBe('mine@example.com')
    })

    it('signs in as one of them without an email at all', async () => {
      const created = await service.signUpDj('mine@example.com', 'password', 'DJ Mine')
      await service.signOutDj()

      const back = adoptDemoProfile(created.id)
      expect(back.id).toBe(created.id)
      expect((await service.getCurrentDjProfile())?.id).toBe(created.id)
    })

    /**
     * Profiles created before sign-up recorded an email have none, and this
     * list is the only route back into them — so they must appear, marked.
     */
    it('shows an account whose email was never recorded', async () => {
      const created = await service.signUpDj('mine@example.com', 'password', 'DJ Mine')
      // Strip the account row, leaving the profile as older versions left it.
      const { getDb } = await import('../../src/services/demo/demoStore')
      const db = getDb()
      db.accounts = db.accounts.filter((a) => a.profileId !== created.id)

      const orphan = listDemoDjAccounts().find((a) => a.profile.id === created.id)
      expect(orphan).toBeDefined()
      expect(orphan!.email).toBeNull()

      expect(adoptDemoProfile(created.id).id).toBe(created.id)
    })

    it('refuses an account that is not on this device', () => {
      expect(() => adoptDemoProfile('nope')).toThrow(ServiceError)
    })
  })
})

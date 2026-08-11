import type { Profile } from '../../types/domain'
import { getDb, mutate } from './demoStore'
import { ServiceError } from '../types'

/**
 * Getting back into your own demo account.
 *
 * Demo mode wears the clothes of a real account system — email, password, sign
 * in, sign out — but underneath it is a sandbox in this browser's storage.
 * There is no server, no password to check and no way to send a reset, so an
 * email typed slightly differently from the one used at sign-up locks a DJ out
 * of their own events permanently. That is a bad trade for a login that was
 * never protecting anything.
 *
 * So the accounts on the device are shown and can be chosen. Nothing is
 * weakened by it: whoever is holding the phone already has the database, and
 * picking your own name off a list is not the failure the email lookup exists
 * to prevent — that one was about *typing an email* and silently landing in
 * somebody else's account.
 */

export interface DemoDjAccount {
  profile: Profile
  /**
   * Null for accounts made before sign-up recorded one. Those profiles are
   * otherwise unreachable — this list is the only way back into them.
   */
  email: string | null
}

/** Every DJ on this device, most recently created first. */
export function listDemoDjAccounts(): DemoDjAccount[] {
  const db = getDb()
  return db.profiles
    .map((profile) => ({
      profile,
      email: db.accounts.find((a) => a.profileId === profile.id)?.email ?? null,
    }))
    .sort((a, b) => b.profile.createdAt.localeCompare(a.profile.createdAt))
}

/** Sign in as one of them, chosen rather than typed. */
export function adoptDemoProfile(profileId: string): Profile {
  return mutate((db) => {
    const profile = db.profiles.find((p) => p.id === profileId)
    if (!profile) {
      throw new ServiceError('not_found', 'That account is no longer on this device.')
    }
    db.currentDjId = profile.id
    return profile
  })
}

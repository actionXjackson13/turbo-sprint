import { getDataService } from './index'
import type { DataService } from './types'
import { PeerHost } from './peer/PeerHost'
import { PeerGuestService } from './peer/PeerGuestService'
import { PeerError } from './peer/signalling'
import { isDemoMode } from '../lib/env'
import { DEMO_EVENT_CODE } from './demo/seed'

/**
 * Which backend the app is talking to right now, and how to change it.
 *
 * Supabase mode never touches this: the database is the party, every device
 * reads the same rows, and there is nothing to negotiate. Everything below
 * exists for the no-backend build, where the choice is real —
 *
 *   sandbox  the seeded sample event, this device only
 *   hosting  this is the DJ's phone, and it *is* the server
 *   joined   connected to a DJ's phone over a data channel
 *
 * The mode is deliberately not global configuration but session state: the
 * same build is all three depending on what the person did, which is what lets
 * a guest scan a QR code and end up in a real party without installing or
 * configuring anything.
 */

export type PartyMode = 'supabase' | 'sandbox' | 'hosting' | 'joined'

export interface PartyState {
  mode: PartyMode
  /** Live only while hosting. */
  guestCount: number
  /** Set when a party ended badly, for the UI to explain. */
  error: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()

let host: PeerHost | null = null
/** A registration in flight, so concurrent callers share one attempt. */
let starting: Promise<void> | null = null
let guestService: PeerGuestService | null = null
let state: PartyState = {
  mode: isDemoMode() ? 'sandbox' : 'supabase',
  guestCount: 0,
  error: null,
}

/**
 * Enough to rebuild the session after a refresh.
 *
 * sessionStorage rather than localStorage: a party belongs to the tab that is
 * in it. A second tab on the DJ's phone must not try to host the same code —
 * the relay would refuse the duplicate id and break the first one.
 */
const RESUME_KEY = 'soundboard.party'

interface Resume {
  role: 'host' | 'guest'
  code: string
  eventId?: string
}

function readResume(): Resume | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY)
    return raw ? (JSON.parse(raw) as Resume) : null
  } catch {
    return null
  }
}

function writeResume(value: Resume | null): void {
  try {
    if (value) sessionStorage.setItem(RESUME_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(RESUME_KEY)
  } catch {
    // Storage blocked; the party simply will not survive a refresh.
  }
}

function setState(patch: Partial<PartyState>): void {
  state = { ...state, ...patch }
  for (const listener of [...listeners]) listener()
}

export function subscribeParty(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPartyState(): PartyState {
  return state
}

/** The backend screens should be using. Changes when a party is joined. */
export function getActiveService(): DataService {
  return guestService ?? getDataService()
}

/**
 * True when this build can host or join a party at all.
 *
 * Peer-to-peer is what replaces a backend, so it is only interesting when
 * there isn't one. With Supabase configured the database already does this
 * job, better and without needing the DJ's phone awake.
 */
export function canRunPeerParty(): boolean {
  return isDemoMode()
}

/**
 * Whether a code should be looked for out on the network.
 *
 * The seeded sample event is local by definition — it exists identically in
 * every copy of the app and belongs to nobody — so its code stays a sandbox
 * shortcut rather than an attempt to dial a stranger who happens to be
 * hosting under `PLAY`.
 */
export function isRemoteCode(code: string): boolean {
  return canRunPeerParty() && code.toUpperCase() !== DEMO_EVENT_CODE
}

// ---- Hosting ---------------------------------------------------------------

/**
 * Open this device's event to other phones.
 *
 * Idempotent: the control panel calls it on mount, so navigating away and back
 * must not tear down a working party and hand every guest a reconnect.
 */
export async function startHosting(
  eventId: string,
  code: string,
): Promise<void> {
  if (!canRunPeerParty()) return

  /**
   * Never host the sample event.
   *
   * Its code is baked into the seed, so it is `PLAY` in every copy of this app
   * on earth. Hosting it would put every curious person who opened the demo
   * into a fight over one id on a shared relay — the first would take it and
   * everyone after would fail, for a party nobody can join anyway, since the
   * same reasoning stops `PLAY` being dialled. A DJ invites people to an event
   * they created.
   */
  if (!isRemoteCode(code)) return

  if (host) return

  /**
   * Registering takes a round trip, and every DJ screen asks to host on mount.
   * Guarding on `host` alone would only catch the ones that arrive after the
   * first has finished — the rest would each open their own socket, and the
   * relay refuses a duplicate id, so the DJ's own second screen would be what
   * knocked the party down. Callers await the attempt already in flight.
   */
  if (starting) return starting

  const next = new PeerHost(getDataService(), eventId, {
    onGuestCountChange: (count) => setState({ guestCount: count }),
    onError: (error) => setState({ error: error.message }),
  })

  starting = (async () => {
    try {
      await next.start(code)
      host = next
      writeResume({ role: 'host', code, eventId })
      setState({ mode: 'hosting', guestCount: 0, error: null })
    } catch (err) {
      const message =
        err instanceof PeerError
          ? err.message
          : 'Could not open the party to other phones.'
      setState({ mode: 'sandbox', error: message })
      throw err
    } finally {
      starting = null
    }
  })()

  return starting
}

export function stopHosting(): void {
  host?.stop()
  host = null
  starting = null
  if (readResume()?.role === 'host') writeResume(null)
  setState({ mode: 'sandbox', guestCount: 0 })
}

// ---- Joining ---------------------------------------------------------------

/**
 * Connect to a DJ hosting under `code`.
 *
 * On success every screen starts reading from the DJ's phone instead of this
 * one — see getActiveService.
 */
export async function joinParty(code: string): Promise<void> {
  if (!canRunPeerParty()) return

  guestService?.disconnect()
  const service = new PeerGuestService(code, (error) => {
    guestService = null
    writeResume(null)
    setState({ mode: 'sandbox', error: error.message })
  })

  await service.connect()

  guestService = service
  writeResume({ role: 'guest', code })
  setState({ mode: 'joined', error: null })
}

export function leaveParty(): void {
  guestService?.disconnect()
  guestService = null
  if (readResume()?.role === 'guest') writeResume(null)
  setState({ mode: 'sandbox', error: null })
}

/**
 * Rebuild the session after a page refresh.
 *
 * A guest who reloads mid-party would otherwise land in the sandbox showing
 * seeded sample songs, which looks like the party silently emptied. Failure is
 * quiet on purpose: the screen that needed the party will report it, and there
 * is nothing useful to say on a cold start.
 */
export async function resumeParty(): Promise<void> {
  const saved = readResume()
  if (!saved || !canRunPeerParty()) return

  try {
    if (saved.role === 'guest') await joinParty(saved.code)
    else if (saved.eventId) await startHosting(saved.eventId, saved.code)
  } catch {
    writeResume(null)
  }
}

/** Test hook — drops any live party without touching the transport. */
export function __resetPartySession(): void {
  host = null
  starting = null
  guestService = null
  state = {
    mode: isDemoMode() ? 'sandbox' : 'supabase',
    guestCount: 0,
    error: null,
  }
  writeResume(null)
}

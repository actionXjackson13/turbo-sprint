import { getDataService } from './index'
import type { DataService } from './types'
import { PeerHost } from './peer/PeerHost'
import { PeerGuestService } from './peer/PeerGuestService'
import { PeerError, type PeerErrorKind } from './peer/signalling'
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
  /**
   * Which event is currently open to other phones.
   *
   * Surfaced because "am I hosting" is not the question a screen needs
   * answered — "is *this* event the one being hosted" is. A DJ with more than
   * one event could otherwise be shown a confident "party is open" while the
   * code on screen belonged to a different party entirely.
   */
  hostedEventId: string | null
  /** Live only while hosting. */
  guestCount: number
  /** Set when a party ended badly, for the UI to explain. */
  error: string | null
  /**
   * The event the DJ is currently looking at as a guest, if any.
   *
   * Only ever set on the DJ's own device: it is a second session this browser
   * chose to open, not anything the party knows about. A real guest cannot be
   * in this state, which is why the way back out is safe to show whenever it is.
   */
  previewingEventId: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()

let host: PeerHost | null = null
/** What `host` (or `starting`) is for, so a different event can take over. */
let hostedTarget: { eventId: string; code: string } | null = null
/** A registration in flight, so concurrent callers share one attempt. */
let starting: Promise<void> | null = null
let guestService: PeerGuestService | null = null
/** The DJ looking at their own party through a guest's session. */
let previewService: DataService | null = null
let state: PartyState = {
  mode: isDemoMode() ? 'sandbox' : 'supabase',
  hostedEventId: null,
  guestCount: 0,
  error: null,
  previewingEventId: null,
}

/**
 * Enough to rebuild the session after a refresh.
 *
 * sessionStorage rather than localStorage: a party belongs to the tab that is
 * in it. A second tab on the DJ's phone must not try to host the same code —
 * the relay would refuse the duplicate id and break the first one.
 */
const RESUME_KEY = 'soundboard.party'

/**
 * The guest preview, so a reload does not strand the DJ.
 *
 * Without it, refreshing while looking at the party as a guest leaves the app
 * on guest screens with the DJ's own session behind them — no guest row, no way
 * back, and nothing on screen explaining why. sessionStorage rather than
 * localStorage for the same reason as the party: this belongs to the tab that
 * opened it, not to the browser.
 */
const PREVIEW_KEY = 'soundboard.guestPreview'

interface PreviewResume {
  eventId: string
  code: string
  displayName: string
}

function readPreview(): PreviewResume | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_KEY)
    return raw ? (JSON.parse(raw) as PreviewResume) : null
  } catch {
    return null
  }
}

function writePreview(value: PreviewResume | null): void {
  try {
    if (value) sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(PREVIEW_KEY)
  } catch {
    // Storage blocked; the preview simply will not survive a refresh.
  }
}

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

/**
 * The backend screens should be using.
 *
 * Three answers, most specific first: the DJ's guest preview, a party joined
 * over the wire, or this build's own backend. Every screen reads through this,
 * so swapping it is what lets the same request form be a guest's one moment and
 * the DJ's the next without a single component knowing.
 */
export function getActiveService(): DataService {
  return previewService ?? guestService ?? getDataService()
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
 * Registration failures that fix themselves if we simply ask again.
 *
 * `id-taken` is the common one and it is almost never a real collision: the
 * relay holds a code until the socket that claimed it is reaped, so a DJ who
 * reloads the page, gets a call, or has the app killed and reopened comes back
 * to find their own previous session still holding their code. That clears
 * within a minute — but the first attempt was the only attempt, so the party
 * stayed shut for the rest of the session while the DJ looked at a code nobody
 * could use. `signal-failed` is the same shape of problem one layer down.
 */
const RETRYABLE_HOST_ERRORS: ReadonlySet<PeerErrorKind> = new Set<PeerErrorKind>(
  ['id-taken', 'signal-failed'],
)

const HOST_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 20_000]

/** What to tell the DJ while a retry is in flight. */
function hostRetryMessage(kind: PeerErrorKind): string {
  return kind === 'id-taken'
    ? 'Reopening the party — your last session is still letting go of this code. This usually clears within a minute.'
    : 'Reaching the connection service… retrying.'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

  /**
   * Already serving exactly this event: nothing to do.
   *
   * Every DJ screen asks to host on mount, so navigating between the control
   * panel, the queue and the invite screen must not tear down a working party
   * and hand every connected guest a reconnect.
   */
  const sameTarget =
    hostedTarget?.eventId === eventId && hostedTarget?.code === code
  if (sameTarget && (host || starting)) return starting ?? undefined

  /**
   * A *different* event wants the device. Hand it over.
   *
   * This is what was broken: the guard used to be `if (host) return`, which
   * asked whether anything was being hosted rather than whether *this* was.
   * A DJ who created a second event stayed registered under the first one's
   * code for the rest of the session — the relay had nobody under the code on
   * their screen, so every guest who tried it was told no such party existed,
   * while the DJ was shown a confident "party is open".
   */
  if (!sameTarget && (host || starting)) {
    stopHosting()
  }

  const next = new PeerHost(getDataService(), eventId, {
    onGuestCountChange: (count) => setState({ guestCount: count }),
    onError: (error) => setState({ error: error.message }),
  })

  const target = { eventId, code }
  hostedTarget = target

  /**
   * Only commit if this is still the event being asked for.
   *
   * Registering takes a round trip, and the DJ can move on during it — a slow
   * start for the event they just left would otherwise land afterwards and
   * install itself as the live host, undoing the handover it was superseded
   * by. Identity comparison, not equality: `hostedTarget` is replaced whole,
   * so a later call cannot be mistaken for this one.
   */
  const superseded = () => hostedTarget !== target

  starting = (async () => {
    try {
      /**
       * Keep trying for as long as the DJ is still on this event.
       *
       * There is no deadline because there is no better thing to do at the end
       * of one: a DJ looking at a join code wants it to work, and the only exit
       * that means anything is them leaving the event or ending it — both of
       * which supersede this attempt and break the loop. The backoff tops out
       * at twenty seconds, so a relay that is genuinely down costs one socket
       * every twenty seconds rather than a spin.
       */
      for (let attempt = 0; ; attempt += 1) {
        try {
          await next.start(code)
          break
        } catch (err) {
          if (superseded()) return

          const kind = err instanceof PeerError ? err.kind : null
          if (!kind || !RETRYABLE_HOST_ERRORS.has(kind)) throw err

          // Still shut, still trying — and the DJ is told which of those it is.
          setState({
            mode: 'sandbox',
            hostedEventId: null,
            error: hostRetryMessage(kind),
          })

          const wait =
            HOST_RETRY_DELAYS_MS[
              Math.min(attempt, HOST_RETRY_DELAYS_MS.length - 1)
            ]!
          await sleep(wait)
          if (superseded()) return
        }
      }

      if (superseded()) {
        next.stop()
        return
      }

      host = next
      writeResume({ role: 'host', code, eventId })
      setState({
        mode: 'hosting',
        hostedEventId: eventId,
        guestCount: 0,
        error: null,
      })
    } catch (err) {
      const message =
        err instanceof PeerError
          ? err.message
          : 'Could not open the party to other phones.'
      if (!superseded()) {
        hostedTarget = null
        setState({ mode: 'sandbox', hostedEventId: null, error: message })
      }
      throw err
    } finally {
      // Only clear the in-flight handle if it is still ours to clear.
      if (!superseded()) starting = null
    }
  })()

  return starting
}

export function stopHosting(): void {
  host?.stop()
  host = null
  hostedTarget = null
  starting = null
  if (readResume()?.role === 'host') writeResume(null)
  setState({ mode: 'sandbox', hostedEventId: null, guestCount: 0 })
}

// ---- Seeing it as a guest ---------------------------------------------------

/**
 * Look at your own party the way the room does.
 *
 * Not a mock and not a preview mode inside the DJ's session: a real anonymous
 * guest, joined through the same RPC every phone at the door goes through, on a
 * second Supabase session that sits beside the DJ's rather than replacing it.
 * Requests made here are real requests and appear in the real queue, because a
 * preview that cannot do the thing being previewed answers nothing.
 *
 * The DJ's own session is untouched throughout, so coming back is instant.
 */
export async function startGuestPreview(
  eventId: string,
  code: string,
  displayName: string,
): Promise<void> {
  // Demo mode already lets a device act as a guest, and its whole database is
  // local — there is no second identity to establish.
  if (isDemoMode()) {
    writePreview({ eventId, code, displayName })
    setState({ previewingEventId: eventId })
    return
  }

  const { SupabaseService } = await import('./supabase/SupabaseService')
  const { getPreviewClient } = await import('./supabase/previewClient')

  const service = new SupabaseService(getPreviewClient())
  await service.getOrCreateGuestIdentity()

  // Idempotent server-side: a guest already in the event keeps their row.
  await service.joinEvent(code, displayName)

  previewService = service
  writePreview({ eventId, code, displayName })
  setState({ previewingEventId: eventId })
}

export function stopGuestPreview(): void {
  previewService = null
  writePreview(null)
  setState({ previewingEventId: null })

  if (isDemoMode()) return
  void import('./supabase/previewClient').then((m) =>
    m.clearPreviewSession(),
  )
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
  setState({ mode: 'joined', hostedEventId: null, error: null })
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
  const preview = readPreview()
  if (preview) {
    try {
      await startGuestPreview(
        preview.eventId,
        preview.code,
        preview.displayName,
      )
    } catch {
      // The event ended, or the guest identity could not be rebuilt. Dropping
      // the flag is what puts the DJ back on their own screens.
      writePreview(null)
      setState({ previewingEventId: null })
    }
  }

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
  hostedTarget = null
  starting = null
  guestService = null
  previewService = null
  writePreview(null)
  state = {
    mode: isDemoMode() ? 'sandbox' : 'supabase',
    hostedEventId: null,
    guestCount: 0,
    error: null,
    previewingEventId: null,
  }
  writeResume(null)
}

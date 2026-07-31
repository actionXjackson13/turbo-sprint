import { useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AppButton } from './AppButton'
import { AppInput } from './AppInput'
import { routes } from '../lib/router'
import { useDjAuth } from '../hooks/useDjAuth'
import { useToast } from '../hooks/useToast'
import { useDemoPersonas } from '../hooks/useDemoPersonas'
import { useDialogBehavior } from '../hooks/useDialogBehavior'
import {
  addDemoPersona,
  switchDemoPersona,
} from '../services/demo/demoIdentity'
import { DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD } from '../services/demo/seed'
import { getErrorMessage } from '../utils/errors'

export interface DemoSwitcherProps {
  eventId: string
  /** Which side of the app is on screen, so the pill can name it. */
  view: 'guest' | 'dj'
}

/**
 * Demo-mode identity switcher.
 *
 * Demo mode is a single mode you enter once; this is how you move around
 * inside it. You can drop into the DJ's control panel and back out to any
 * guest, and add guests so requests and votes come from more than one person —
 * none of which a real client may do, which is why this is rendered only when
 * `isDemoMode()` is true and talks to the demo store directly rather than
 * through `DataService`.
 */
export function DemoSwitcher({ eventId, view }: DemoSwitcherProps) {
  const [open, setOpen] = useState(false)
  const { active } = useDemoPersonas(eventId)
  const { profile } = useDjAuth()

  const djName = profile?.displayName ?? 'DJ'
  const label = view === 'dj' ? djName : (active?.displayName ?? 'Guest')

  return (
    <>
      {/* Sits above the bottom navigation, inside the phone-width column. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-shell">
        <div className="flex justify-end px-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={clsx(
              'pointer-events-auto flex min-h-11 items-center gap-2 rounded-full',
              'border border-dashed border-brand-400/60 bg-ink-800/95 pr-3 pl-2 backdrop-blur',
              'text-sm font-semibold text-fg shadow-lg shadow-black/40',
              'hover:bg-ink-700 active:bg-ink-800',
            )}
          >
            <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] tracking-wide text-brand-400 uppercase">
              Demo
            </span>
            <span className="max-w-32 truncate">
              {view === 'dj' ? `${label} (DJ)` : label}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="size-4 shrink-0 text-fg-subtle"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
            </svg>
            <span className="sr-only">Switch who you are in the demo</span>
          </button>
        </div>
      </div>

      <DemoSwitcherSheet
        open={open}
        eventId={eventId}
        view={view}
        djName={djName}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

interface SheetProps {
  open: boolean
  eventId: string
  view: 'guest' | 'dj'
  djName: string
  onClose: () => void
}

function DemoSwitcherSheet({
  open,
  eventId,
  view,
  djName,
  onClose,
}: SheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, signIn } = useDjAuth()
  const { personas, active } = useDemoPersonas(eventId)

  const panelRef = useRef<HTMLDivElement>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useDialogBehavior({ open, panelRef, onDismiss: onClose })

  if (!open || typeof document === 'undefined') return null

  const goToDj = async () => {
    setBusy(true)
    try {
      // Demo mode has a single DJ account; signing in is a formality that
      // keeps the same auth path as a real session.
      if (!profile) await signIn(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
      onClose()
      navigate(routes.dj.event(eventId))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const goToGuest = (guestUserId: string) => {
    switchDemoPersona(guestUserId)
    onClose()
    navigate(routes.guest.home(eventId))
  }

  const addGuest = (e: FormEvent) => {
    e.preventDefault()
    try {
      const persona = addDemoPersona(eventId, newName)
      setNewName('')
      onClose()
      toast.success(`You are now ${persona.displayName}.`)
      navigate(routes.guest.home(eventId))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-switcher-title"
        className="relative mx-auto flex max-h-[85dvh] w-full max-w-shell flex-col rounded-t-3xl border-t border-ink-600 bg-ink-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-ink-500" />
        <h2
          id="demo-switcher-title"
          className="shrink-0 text-lg font-bold text-fg"
        >
          Who are you right now?
        </h2>
        <p className="mt-1 shrink-0 text-sm text-fg-muted">
          Switch sides freely — everyone shares the same event.
        </p>

        <div className="-mx-1 mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1">
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
              The DJ
            </h3>
            <PersonRow
              name={djName}
              detail="Moderate requests, run the queue, start votes"
              selected={view === 'dj'}
              disabled={busy}
              onSelect={() => void goToDj()}
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
              Guests
            </h3>
            <ul className="space-y-2">
              {personas.map((persona) => (
                <li key={persona.guestUserId}>
                  <PersonRow
                    name={persona.displayName}
                    detail={
                      persona.isBlocked
                        ? 'Blocked by the DJ'
                        : 'Request songs and vote as this guest'
                    }
                    selected={
                      view === 'guest' &&
                      persona.guestUserId === active?.guestUserId
                    }
                    disabled={busy}
                    onSelect={() => goToGuest(persona.guestUserId)}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Outside the scroll area: adding people is the point of the sheet,
            so it must not sit below a fold on a long roster. */}
        <form onSubmit={addGuest} className="mt-4 shrink-0 space-y-2">
          <AppInput
            label="Add another guest"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            maxLength={40}
            autoComplete="off"
          />
          <AppButton
            type="submit"
            variant="secondary"
            fullWidth
            disabled={newName.trim().length === 0}
          >
            Add and switch to them
          </AppButton>
        </form>

        <AppButton
          variant="ghost"
          size="lg"
          fullWidth
          className="mt-2 shrink-0"
          onClick={onClose}
        >
          Close
        </AppButton>
      </div>
    </div>,
    document.body,
  )
}

interface PersonRowProps {
  name: string
  detail: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

function PersonRow({
  name,
  detail,
  selected,
  disabled,
  onSelect,
}: PersonRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={selected || undefined}
      className={clsx(
        'flex w-full min-h-14 items-center gap-3 rounded-2xl border px-3 py-2 text-left',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-brand-400 bg-brand-500/10'
          : 'border-ink-600 bg-ink-700 hover:bg-ink-600',
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-brand-400"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-fg">{name}</span>
        <span className="block truncate text-xs text-fg-muted">{detail}</span>
      </span>
      {selected && (
        <>
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-brand-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span className="sr-only">Currently acting as this person</span>
        </>
      )}
    </button>
  )
}

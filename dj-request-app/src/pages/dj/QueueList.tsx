import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AppButton } from '../../components'
import { haptic } from '../../utils/haptics'
import type { SongRequest } from '../../types/domain'
import { isDjSong } from '../../features/requests/queueOrdering'
import { AlbumArt } from '../../components'

export interface QueueListProps {
  queue: SongRequest[]
  busy: boolean
  /** Persists a new order. Receives request ids, first to last. */
  onReorder: (orderedIds: string[]) => Promise<void>
  /** Moves the song to the front of the queue. */
  onPlayNext: (request: SongRequest) => void
  /** Id currently being moved, so its button can show progress. */
  playNextPendingId: string | null
  onMarkPlayed: (request: SongRequest) => void
}

/**
 * How long the grip must be held before a row lifts.
 *
 * The queue is scrolled far more often than it is reordered, and the grip sits
 * inside that scroll. Without a delay every drag of the list risks dragging a
 * song instead. 500ms is the platform convention for a drag lift — long enough
 * to be deliberate, short enough not to feel broken.
 */
const HOLD_MS = 500

interface DragState {
  /** Index the row started at. */
  from: number
  /** Index it would land on if released now. */
  to: number
  /** Pixels the finger has travelled since the lift. */
  offset: number
  rowHeight: number
}

export function QueueList({
  queue,
  busy,
  onReorder,
  onPlayNext,
  playNextPendingId,
  onMarkPlayed,
}: QueueListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  // Held in a ref as well: the pointer handlers are attached to the window and
  // would otherwise close over a stale value between renders.
  const dragRef = useRef<DragState | null>(null)
  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const holdTimer = useRef<number | null>(null)
  const cancelHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  useEffect(() => cancelHold, [])

  const rowHeightAt = (index: number): number => {
    const rows = listRef.current?.querySelectorAll('li')
    const row = rows?.[index] ?? rows?.[0]
    if (!row) return 76
    const style = getComputedStyle(listRef.current!)
    return row.getBoundingClientRect().height + parseFloat(style.rowGap || '0')
  }

  const beginDrag = (index: number, startY: number) => {
    haptic('tap')
    setDragState({ from: index, to: index, offset: 0, rowHeight: rowHeightAt(index) })

    const onMove = (e: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      e.preventDefault()

      const offset = e.clientY - startY
      const steps = Math.round(offset / current.rowHeight)
      const to = Math.min(
        queue.length - 1,
        Math.max(0, current.from + steps),
      )
      if (to !== current.to) haptic('tap')
      setDragState({ ...current, offset, to })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)

      const current = dragRef.current
      setDragState(null)
      if (!current || current.to === current.from) return

      haptic('confirm')
      void onReorder(moveId(queue, current.from, current.to))
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onGripPointerDown = (index: number) => (e: React.PointerEvent) => {
    if (busy) return
    const startY = e.clientY
    cancelHold()
    holdTimer.current = window.setTimeout(() => beginDrag(index, startY), HOLD_MS)
  }

  const moveTo = (from: number, to: number) => {
    setPickerFor(null)
    if (from === to) return
    haptic('confirm')
    void onReorder(moveId(queue, from, to))
  }

  /** Where a row sits while a drag is in flight. */
  const rowShift = (index: number): number => {
    if (!drag) return 0
    if (index === drag.from) return drag.offset
    if (drag.to > drag.from && index > drag.from && index <= drag.to) {
      return -drag.rowHeight
    }
    if (drag.to < drag.from && index < drag.from && index >= drag.to) {
      return drag.rowHeight
    }
    return 0
  }

  return (
    <ol ref={listRef} className="flex flex-col gap-2">
      {queue.map((request, index) => {
        const lifted = drag?.from === index
        const position = lifted ? drag.to + 1 : index + 1

        return (
          <li
            key={request.id}
            className={clsx(
              'rounded-card border bg-ink-900',
              lifted
                ? 'relative z-20 border-brand-500/60 shadow-lg shadow-black/50'
                : 'border-hairline',
              // Rows displaced by the drag glide; the lifted one tracks the
              // finger exactly and must not lag behind it.
              !lifted && drag && 'transition-transform duration-150',
            )}
            style={{
              transform: `translateY(${rowShift(index)}px)`,
              touchAction: drag ? 'none' : undefined,
            }}
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <PositionButton
                position={position}
                total={queue.length}
                open={pickerFor === request.id}
                disabled={busy || drag !== null}
                onToggle={() =>
                  setPickerFor(pickerFor === request.id ? null : request.id)
                }
                onPick={(target) => moveTo(index, target - 1)}
              />

              <AlbumArt
                url={request.artworkUrl}
                size="sm"
                className={clsx(
                  // A coloured edge on the room's songs, so scanning the queue
                  // does not mean reading every third line.
                  !isDjSong(request) && '!border-accent-400/70',
                )}
              />

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-row font-semibold text-fg">
                  {request.title}
                </h3>
                <p className="truncate text-meta text-fg-muted">
                  {request.artist}
                </p>
                {/*
                  Whose song this is, at a glance. Once a DJ can drop a
                  thirty-song set into the queue, most rows are their own — and
                  the few that came from the room are the ones that need
                  spotting while reading the list one-handed in the dark. A
                  vote count on a song nobody voted for is noise, so the DJ's
                  rows say what they are instead.
                */}
                {isDjSong(request) ? (
                  <p className="truncate text-meta text-fg-subtle">
                    <span className="text-brand-400">Your song</span>
                  </p>
                ) : (
                  <p className="truncate text-meta text-fg-subtle">
                    <span className="text-accent-400">
                      {request.guestDisplayName}
                    </span>{' '}
                    · {request.voteCount}{' '}
                    {request.voteCount === 1 ? 'vote' : 'votes'}
                  </p>
                )}
              </div>

              {/* Where the up/down arrows used to be. */}
              <button
                type="button"
                aria-label={`Reorder ${request.title}. Hold, then drag up or down.`}
                disabled={busy}
                onPointerDown={onGripPointerDown(index)}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                onContextMenu={(e) => e.preventDefault()}
                className={clsx(
                  'flex size-11 shrink-0 touch-none items-center justify-center rounded-control',
                  'text-fg-subtle transition-colors select-none',
                  lifted ? 'bg-ink-700 text-brand-400' : 'hover:text-fg',
                  'disabled:opacity-40',
                )}
              >
                <GripIcon />
              </button>
            </div>

            <div
              className={clsx(
                'flex gap-2 border-t border-hairline px-3 py-2.5',
                // Kept mounted while dragging: hiding them would change every
                // row's height after the drag measured it, and the displaced
                // rows would slide by the wrong amount.
                drag && 'pointer-events-none opacity-40',
              )}
            >
              <AppButton
                size="sm"
                fullWidth
                disabled={busy || drag !== null || index === 0}
                loading={playNextPendingId === request.id}
                onClick={() => onPlayNext(request)}
              >
                Play next
              </AppButton>
              <AppButton
                size="sm"
                variant="secondary"
                fullWidth
                disabled={busy || drag !== null}
                onClick={() => onMarkPlayed(request)}
              >
                Mark played
              </AppButton>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Three slim rules, drawn thinner than the old arrow tiles. */
function GripIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M4 8h16M4 12h16M4 16h16" />
    </svg>
  )
}

interface PositionButtonProps {
  position: number
  total: number
  open: boolean
  disabled: boolean
  onToggle: () => void
  onPick: (position: number) => void
}

/**
 * The queue position, and a way to set it directly.
 *
 * Dragging is fine for nudging a song a place or two and tedious for moving
 * one from tenth to second. Tapping the number offers every slot at once.
 */
function PositionButton({
  position,
  total,
  open,
  disabled,
  onToggle,
  onPick,
}: PositionButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const holdTimer = useRef<number | null>(null)
  const openedByHold = useRef(false)
  // Rows near the bottom of the screen would open the menu off-screen.
  const [dropUp, setDropUp] = useState(false)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    setDropUp(rect ? rect.bottom > window.innerHeight * 0.55 : false)
    onToggle()
  }

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  useEffect(() => clearHold, [])

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Position ${position} of ${total}. Change position.`}
        onPointerDown={() => {
          openedByHold.current = false
          clearHold()
          holdTimer.current = window.setTimeout(() => {
            openedByHold.current = true
            haptic('tap')
            if (!open) openMenu()
          }, HOLD_MS)
        }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          // A hold already opened it; don't close it again on release.
          if (openedByHold.current) return
          if (open) onToggle()
          else openMenu()
        }}
        className={clsx(
          'flex size-9 items-center justify-center rounded-full border text-base font-bold tabular-nums transition-colors',
          open
            ? 'border-brand-500 bg-brand-500/20 text-brand-400'
            : 'border-hairline-strong bg-ink-700 text-fg',
          'disabled:opacity-40',
        )}
      >
        {position}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Move to position"
          className={clsx(
            'absolute left-0 z-30 w-max max-w-[15rem] rounded-card border border-hairline-strong bg-ink-800 p-2 shadow-xl shadow-black/60',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          <div className="no-scrollbar flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {Array.from({ length: total }, (_, i) => i + 1).map((slot) => (
              <button
                key={slot}
                type="button"
                role="menuitem"
                onClick={() => onPick(slot)}
                className={clsx(
                  'size-9 rounded-control text-sm font-semibold tabular-nums transition-colors',
                  slot === position
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'bg-ink-700 text-fg hover:bg-ink-600',
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** The queue's ids with one entry moved from `from` to `to`. */
function moveId(queue: SongRequest[], from: number, to: number): string[] {
  const ids = queue.map((r) => r.id)
  const [moved] = ids.splice(from, 1)
  ids.splice(to, 0, moved!)
  return ids
}

import clsx from 'clsx'
import type { VotingOption } from '../types/domain'

export interface VotingOptionCardProps {
  option: VotingOption
  votes: number
  totalVotes: number
  /** This option is the current guest's selection. */
  selected?: boolean
  /** Round has finished and this option won. */
  isWinner?: boolean
  /** Hides the selection affordance (round over, or DJ view). */
  readOnly?: boolean
  pending?: boolean
  onSelect?: () => void
}

export function VotingOptionCard({
  option,
  votes,
  totalVotes,
  selected = false,
  isWinner = false,
  readOnly = false,
  pending = false,
  onSelect,
}: VotingOptionCardProps) {
  const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

  const content = (
    <>
      {/* Result bar sits behind the label so totals stay readable while voting. */}
      <div
        className={clsx(
          'absolute inset-y-0 left-0 transition-[width] duration-300',
          isWinner
            ? 'bg-success-500/25'
            : selected
              ? 'bg-brand-500/25'
              : 'bg-ink-600/60',
        )}
        style={{ width: `${percent}%` }}
        aria-hidden="true"
      />

      <div className="relative flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-fg">
              {option.title}
            </h3>
            {isWinner && (
              <span className="shrink-0 rounded-full bg-success-500/20 px-2 py-0.5 text-xs font-bold text-success-500">
                Winner
              </span>
            )}
          </div>
          <p className="truncate text-sm text-fg-muted">{option.artist}</p>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-lg leading-none font-bold tabular-nums text-fg">
            {percent}%
          </div>
          <div className="mt-0.5 text-xs text-fg-subtle tabular-nums">
            {votes} {votes === 1 ? 'vote' : 'votes'}
          </div>
        </div>

        {selected && !readOnly && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 shrink-0 text-brand-400"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </div>
    </>
  )

  // Only a chosen or winning option is outlined; the rest rely on the surface
  // alone, so the one that matters is the one your eye lands on.
  const baseClasses = clsx(
    'relative w-full overflow-hidden rounded-card border transition-colors',
    isWinner
      ? 'border-success-500/50'
      : selected
        ? 'border-brand-500/70'
        : 'border-transparent',
    'bg-ink-900',
  )

  if (readOnly) {
    return <div className={baseClasses}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={pending}
      aria-pressed={selected}
      aria-label={`Vote for ${option.title} by ${option.artist}`}
      className={clsx(
        baseClasses,
        'min-h-16 hover:border-brand-500/60 disabled:opacity-70',
      )}
    >
      {content}
    </button>
  )
}

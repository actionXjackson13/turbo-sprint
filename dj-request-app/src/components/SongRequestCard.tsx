import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { SongRequest } from '../types/domain'
import { StatusBadge } from './StatusBadge'
import { formatRelativeTime } from '../utils/formatRelativeTime'

export interface SongRequestCardProps {
  request: SongRequest
  /** Renders the vote pill. Omit for DJ views where voting is not applicable. */
  showVote?: boolean
  /**
   * Renders the tally without the control. DJ views want the number — it is
   * how they read the room — but the DJ has no vote of their own to cast.
   * Ignored when `showVote` is set.
   */
  showVoteCount?: boolean
  /** Whether the current guest has already voted for this request. */
  hasVoted?: boolean
  /** Guests cannot withdraw the founding vote on their own request. */
  voteLocked?: boolean
  votePending?: boolean
  onVoteToggle?: () => void
  /** Makes the card body activate this handler (navigate to details). */
  onOpen?: () => void
  showStatus?: boolean
  /** DJ action buttons rendered beneath the card body. */
  actions?: ReactNode
  className?: string
}

export function SongRequestCard({
  request,
  showVote = false,
  showVoteCount = false,
  hasVoted = false,
  voteLocked = false,
  votePending = false,
  onVoteToggle,
  onOpen,
  showStatus = true,
  actions,
  className,
}: SongRequestCardProps) {
  const voteLabel = hasVoted
    ? voteLocked
      ? `${request.voteCount} votes — your request`
      : `Remove your vote from ${request.title}`
    : `Upvote ${request.title}`

  return (
    <article
      className={clsx(
        'rounded-card border border-ink-700 bg-ink-800',
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* The tappable body is a button so keyboard users get it for free. */}
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-left"
          >
            <RequestBody request={request} showStatus={showStatus} />
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <RequestBody request={request} showStatus={showStatus} />
          </div>
        )}

        {!showVote && showVoteCount && (
          <div
            className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-ink-600 bg-ink-700 text-fg-muted"
            aria-label={`${request.voteCount} ${
              request.voteCount === 1 ? 'vote' : 'votes'
            }`}
          >
            <VoteArrow />
            <span className="text-sm font-bold tabular-nums">
              {request.voteCount}
            </span>
          </div>
        )}

        {showVote && (
          <button
            type="button"
            onClick={onVoteToggle}
            disabled={voteLocked || votePending || !onVoteToggle}
            aria-pressed={hasVoted}
            aria-label={voteLabel}
            className={clsx(
              'flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-colors',
              hasVoted
                ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                : 'border-ink-600 bg-ink-700 text-fg-muted hover:border-brand-500/50 hover:text-fg',
              (voteLocked || votePending) && 'opacity-70',
              voteLocked ? 'cursor-default' : 'disabled:cursor-not-allowed',
            )}
          >
            <VoteArrow filled={hasVoted} />
            <span className="text-sm font-bold tabular-nums">
              {request.voteCount}
            </span>
          </button>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap gap-2 border-t border-ink-700 p-3">
          {actions}
        </div>
      )}
    </article>
  )
}

function VoteArrow({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

function RequestBody({
  request,
  showStatus,
}: {
  request: SongRequest
  showStatus: boolean
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base leading-snug font-semibold text-fg">
          {request.title}
        </h3>
        {showStatus && <StatusBadge status={request.status} />}
      </div>
      <p className="mt-0.5 truncate text-sm text-fg-muted">{request.artist}</p>
      <p className="mt-1.5 truncate text-xs text-fg-subtle">
        {request.guestDisplayName} · {formatRelativeTime(request.createdAt)}
      </p>
    </>
  )
}

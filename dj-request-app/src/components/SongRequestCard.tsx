import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { SongRequest } from '../types/domain'
import { AlbumArt } from './AlbumArt'
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
  /** Opens the overflow sheet. Rendered as a quiet trailing control. */
  onMore?: () => void
  /**
   * The one or two moves worth a tap from a list. Everything else belongs
   * behind `onMore` — a card offering seven equal buttons offers none.
   */
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
  onMore,
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
        'rounded-card border border-hairline bg-ink-900',
        className,
      )}
    >
      {/* Tighter padding than before. Rows are the most repeated element in the
          app, so every extra pixel here is multiplied down the whole list and
          is most of what made screens feel crowded. */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        {/* Always drawn, cover or not. A list where only some rows carry a
            picture is ragged in a way that reads as a rendering fault. */}
        <AlbumArt url={request.artworkUrl} size="md" />

        {/* The tappable body is a button so keyboard users get it for free. */}
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            // min-h-11 keeps the row's primary tap target at 44px even though
            // the two lines of text only need 40.
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left"
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
            className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-1 text-fg-muted"
            aria-label={`${request.voteCount} ${
              request.voteCount === 1 ? 'vote' : 'votes'
            }`}
          >
            <VoteArrow />
            <span className="text-meta font-semibold tabular-nums">
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
              // Visually a slim 44px square rather than a heavy bordered tile;
              // the touch target is unchanged.
              'flex size-11 shrink-0 flex-col items-center justify-center gap-0.5',
              'rounded-control transition-colors',
              hasVoted
                ? 'bg-brand-500/18 text-brand-400'
                : 'border border-hairline-strong bg-ink-800 text-fg-muted hover:text-fg',
              (voteLocked || votePending) && 'opacity-70',
              voteLocked ? 'cursor-default' : 'disabled:cursor-not-allowed',
            )}
          >
            <VoteArrow filled={hasVoted} />
            <span className="text-meta font-semibold tabular-nums">
              {request.voteCount}
            </span>
          </button>
        )}
      </div>

      {(actions || onMore) && (
        <div className="flex items-center gap-1.5 border-t border-hairline px-3.5 py-2.5">
          {actions}
          {onMore && (
            <button
              type="button"
              onClick={onMore}
              aria-label={`More actions for ${request.title}`}
              className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-control border border-hairline text-fg-muted hover:bg-ink-800 hover:text-fg"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="19" cy="12" r="1.75" />
              </svg>
            </button>
          )}
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
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-row min-w-0 flex-1 truncate font-medium text-fg">
          {request.title}
        </h3>
        {showStatus && <StatusBadge status={request.status} />}
      </div>

      {/* Artist and provenance share a line. Three stacked lines per row made
          lists tall enough that only three songs fit on a phone; two lines
          keeps every detail and shows noticeably more of the queue. */}
      <p className="text-meta mt-1 truncate text-fg-subtle">
        <span className="text-fg-muted">{request.artist}</span>
        <span aria-hidden="true"> · </span>
        {request.guestDisplayName}
        <span aria-hidden="true"> · </span>
        {formatRelativeTime(request.createdAt)}
      </p>
    </>
  )
}

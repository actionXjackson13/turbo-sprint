import clsx from 'clsx'
import type { RequestIntakeStatus, RequestStatus } from '../types/domain'

/**
 * Status is context, not headline.
 *
 * These used to be filled, bordered pills on every row, so a list of ten songs
 * carried ten coloured blocks competing with the titles. A small dot plus
 * quiet text says the same thing without pulling focus — colour still does the
 * scanning work, it just stops shouting.
 *
 * The intake variant keeps a filled treatment: there is only ever one on a
 * screen, and whether the DJ is accepting requests is genuinely headline.
 */

const requestDot: Record<RequestStatus, string> = {
  pending: 'bg-status-pending',
  accepted: 'bg-status-accepted',
  queued: 'bg-status-queued',
  played: 'bg-status-played',
  declined: 'bg-status-declined',
}

const requestText: Record<RequestStatus, string> = {
  pending: 'text-status-pending',
  accepted: 'text-status-accepted',
  queued: 'text-status-queued',
  played: 'text-fg-subtle',
  declined: 'text-status-declined',
}

const requestLabels: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  queued: 'In queue',
  played: 'Played',
  declined: 'Declined',
}

const intakeStyles: Record<RequestIntakeStatus, string> = {
  open: 'bg-status-accepted/12 text-status-accepted',
  paused: 'bg-status-pending/12 text-status-pending',
  closed: 'bg-status-declined/12 text-status-declined',
}

const intakeLabels: Record<RequestIntakeStatus, string> = {
  open: 'Requests open',
  paused: 'Requests paused',
  closed: 'Requests closed',
}

type Props =
  | { kind?: 'request'; status: RequestStatus; className?: string }
  | { kind: 'intake'; status: RequestIntakeStatus; className?: string }

export function StatusBadge(props: Props) {
  const { className } = props

  if (props.kind === 'intake') {
    return (
      <span
        className={clsx(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1',
          'text-meta font-medium whitespace-nowrap',
          intakeStyles[props.status],
          className,
        )}
      >
        <span
          className={clsx(
            'size-1.5 rounded-full bg-current',
            // A gentle pulse only while requests are actually flowing.
            props.status === 'open' && 'animate-pulse',
          )}
          aria-hidden="true"
        />
        {intakeLabels[props.status]}
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 text-meta font-medium whitespace-nowrap',
        requestText[props.status],
        className,
      )}
    >
      <span
        className={clsx('size-1.5 rounded-full', requestDot[props.status])}
        aria-hidden="true"
      />
      {requestLabels[props.status]}
    </span>
  )
}

import clsx from 'clsx'
import type { RequestIntakeStatus, RequestStatus } from '../types/domain'

const requestStyles: Record<RequestStatus, string> = {
  pending: 'bg-status-pending/15 text-status-pending border-status-pending/30',
  accepted:
    'bg-status-accepted/15 text-status-accepted border-status-accepted/30',
  queued: 'bg-status-queued/15 text-status-queued border-status-queued/30',
  played: 'bg-status-played/15 text-status-played border-status-played/30',
  declined:
    'bg-status-declined/15 text-status-declined border-status-declined/30',
}

const requestLabels: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  queued: 'In queue',
  played: 'Played',
  declined: 'Declined',
}

const intakeStyles: Record<RequestIntakeStatus, string> = {
  open: 'bg-status-accepted/15 text-status-accepted border-status-accepted/30',
  paused: 'bg-status-pending/15 text-status-pending border-status-pending/30',
  closed: 'bg-status-declined/15 text-status-declined border-status-declined/30',
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
  const isIntake = props.kind === 'intake'

  const style = isIntake
    ? intakeStyles[props.status]
    : requestStyles[props.status]
  const label = isIntake
    ? intakeLabels[props.status]
    : requestLabels[props.status]

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1',
        'text-xs font-semibold whitespace-nowrap',
        style,
        className,
      )}
    >
      {label}
    </span>
  )
}

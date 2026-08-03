import clsx from 'clsx'
import { isDemoMode } from '../lib/env'

/**
 * Says out loud that demo mode is one device only.
 *
 * Demo mode is indistinguishable from the real thing by design — same screens,
 * same join code, same QR, same share sheet — and that is exactly the problem
 * on the screens whose whole job is inviting other people. A DJ running a
 * build with no backend configured can create an event, hold up a QR code and
 * watch a friend across the room fail to join it, with nothing anywhere saying
 * why. The friend's phone is not being difficult: it has its own private copy
 * of the sample data and has never heard of that event.
 *
 * So the invite screens carry this. It renders nothing at all once Supabase
 * credentials are set, because then every word of it is false.
 */
export interface DemoNoticeProps {
  /**
   * What the guest is being invited to do here, so the notice explains this
   * screen rather than repeating a generic warning.
   */
  children: React.ReactNode
  className?: string
}

export function DemoNotice({ children, className }: DemoNoticeProps) {
  if (!isDemoMode()) return null

  return (
    <div
      role="note"
      className={clsx(
        'rounded-control border border-status-pending/40 bg-status-pending/10 p-3',
        className,
      )}
    >
      <p className="text-label text-status-pending uppercase">
        Demo mode — this device only
      </p>
      <p className="mt-1 text-sm text-fg-muted">{children}</p>
    </div>
  )
}

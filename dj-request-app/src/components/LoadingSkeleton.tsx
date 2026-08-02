import clsx from 'clsx'

export interface LoadingSkeletonProps {
  className?: string
}

/** A single shimmering block. Compose these to mirror the real layout. */
export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  return (
    <div
      className={clsx('animate-pulse rounded-xl bg-ink-700', className)}
      aria-hidden="true"
    />
  )
}

/** Placeholder matching the shape of a SongRequestCard. */
export function SongRequestSkeleton() {
  return (
    // Mirrors the real row: two lines of text and a slim vote control.
    <div className="rounded-card bg-ink-900 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <LoadingSkeleton className="h-4 w-3/5" />
          <LoadingSkeleton className="h-3 w-2/5" />
        </div>
        <LoadingSkeleton className="size-11 rounded-control" />
      </div>
    </div>
  )
}

/**
 * A list of request placeholders.
 * `aria-busy` on a labelled region tells screen readers content is loading.
 */
export function SongRequestListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading requests">
      {Array.from({ length: count }, (_, i) => (
        <SongRequestSkeleton key={i} />
      ))}
    </div>
  )
}

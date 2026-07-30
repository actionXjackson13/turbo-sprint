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
    <div className="rounded-card border border-ink-700 bg-ink-800 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <LoadingSkeleton className="h-5 w-3/5" />
          <LoadingSkeleton className="h-4 w-2/5" />
          <LoadingSkeleton className="h-3 w-1/3" />
        </div>
        <LoadingSkeleton className="h-14 w-14 rounded-2xl" />
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

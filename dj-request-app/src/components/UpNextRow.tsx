import type { SongRequest } from '../types/domain'
import { AlbumArt } from './AlbumArt'

export interface UpNextRowProps {
  /** The head of the queue, or null when nothing is queued. */
  request: SongRequest | null
  /** What to say when the queue is empty — the two sides can do different
   *  things about it, so they say different things. */
  emptyText: string
}

/**
 * What follows the current track, tucked under it.
 *
 * Lives inside the now-playing card on both sides. The DJ needs it to decide
 * whether to intervene; a guest wants it for exactly the reason they keep
 * asking the DJ in person — knowing their song is next is most of the reason
 * they opened the app again.
 *
 * Shared rather than written twice so the two never drift: this used to exist
 * only on the DJ's panel, and the guest's card was the poorer for it.
 */
export function UpNextRow({ request, emptyText }: UpNextRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-ink-950/50 px-3 py-2">
      <AlbumArt url={request?.artworkUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg-subtle uppercase">Up next</p>
        <p className="mt-0.5 truncate text-sm text-fg">
          {request ? (
            <>
              {request.title}{' '}
              <span className="text-fg-muted">— {request.artist}</span>
            </>
          ) : (
            <span className="text-fg-muted">{emptyText}</span>
          )}
        </p>
      </div>
    </div>
  )
}

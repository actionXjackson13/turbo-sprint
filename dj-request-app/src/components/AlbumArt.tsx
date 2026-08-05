import { useState } from 'react'
import clsx from 'clsx'

/**
 * A song's cover, wherever a song is shown.
 *
 * Artwork was reaching only the search results, so a song a guest had picked
 * by its cover arrived on every other screen as two lines of text. Making the
 * lists scannable is most of what the artwork is for — a DJ reading the queue
 * mid-set recognises a sleeve far faster than a title — so it belongs on all
 * of them, drawn identically.
 *
 * The placeholder is not a fallback so much as the point. Half the catalogue
 * reaches us without artwork — anything typed in by hand, any vote option, any
 * request made before search existed — and rows that sometimes have a picture
 * and sometimes do not are ragged in a way that reads as broken. Every row
 * reserves the same square whether or not it can fill it.
 */

const SIZES = {
  sm: 'size-9',
  md: 'size-11',
  lg: 'size-14',
  xl: 'size-16',
  /** The now-playing sleeve: big enough to read the artwork, not just see it. */
  '2xl': 'size-20',
  '3xl': 'size-24',
} as const

export interface AlbumArtProps {
  /** Null for anything the catalogue did not supply a cover for. */
  url: string | null | undefined
  size?: keyof typeof SIZES
  className?: string
}

export function AlbumArt({ url, size = 'md', className }: AlbumArtProps) {
  /**
   * Artwork is hotlinked from Apple's and Deezer's CDNs, which is what those
   * URLs are for — but a link can rot, and a broken-image glyph is worse than
   * no image at all. Falling back to the placeholder keeps the row intact.
   */
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(url) && !broken

  return (
    <span
      className={clsx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-control',
        'border border-hairline bg-ink-800',
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={url!}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-1/2 text-fg-subtle"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )}
    </span>
  )
}

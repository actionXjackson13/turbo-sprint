import type { ReactNode } from 'react'
import clsx from 'clsx'
import { AlbumArt } from './AlbumArt'

export interface NowPlayingCardProps {
  nowPlaying: {
    title: string
    artist: string
    artworkUrl?: string | null
  } | null
  /** Shown in place of a track when nothing is set. */
  emptyHint: string
  /** Controls and context rendered beneath the track. */
  children?: ReactNode
}

/**
 * The current track — the one thing this whole app is arranged around.
 *
 * It used to be a card like any other, which undersold it: a guest opening
 * their phone and a DJ glancing up mid-set are asking the same question, and
 * it should be answerable from arm's length without reading. So the sleeve
 * carries the card. Its own artwork, enlarged and blurred, becomes the
 * background, which makes every track look different from the last — the
 * cheapest way to make the screen feel like it belongs to the music playing
 * rather than to a form.
 *
 * The blur does real work beyond decoration. Cover art is arbitrary and often
 * bright, so it is scaled past the edges, blurred until no detail survives,
 * and covered by a scrim. What is left is the colour of the record and nothing
 * that competes with the title over it.
 *
 * Drawn at one size everywhere. There used to be a smaller variant for the
 * guest's home screen, which had it backwards: a guest can do nothing about
 * the current track except look at it, so it is *more* of what their screen is
 * for, not less.
 */
export function NowPlayingCard({
  nowPlaying,
  emptyHint,
  children,
}: NowPlayingCardProps) {
  const artwork = nowPlaying?.artworkUrl

  return (
    <section
      className={clsx(
        'relative isolate overflow-hidden rounded-card',
        // The brand tint still carries the card when there is no art to do it.
        nowPlaying
          ? 'border border-brand-500/45 bg-brand-500/12'
          : 'border border-hairline bg-ink-900',
        'p-4',
      )}
    >
      {artwork && (
        <>
          {/* Scaled well past the edges so the blur has no visible border, and
              hidden from assistive tech — it carries nothing the title beneath
              it does not already say. */}
          <img
            src={artwork}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 size-full scale-150 object-cover opacity-60 blur-2xl"
          />
          {/* The scrim. Cover art is frequently pale, and the title has to
              stay legible over all of it. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-br from-ink-950/80 via-ink-950/70 to-ink-950/90"
          />
        </>
      )}

      <div className="flex items-center gap-3.5">
        <AlbumArt
          url={artwork}
          size="3xl"
          className="shadow-lg shadow-ink-950/60"
        />

        <div className="min-w-0 flex-1">
          <NowPlayingLabel live={Boolean(nowPlaying)} />

          {nowPlaying ? (
            <>
              <p className="mt-1.5 truncate text-display font-bold text-fg">
                {nowPlaying.title}
              </p>
              <p className="mt-1 truncate text-sm text-fg-muted">
                {nowPlaying.artist}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-fg-muted">{emptyHint}</p>
          )}
        </div>
      </div>

      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}

/**
 * The label, with bars that move while something is playing.
 *
 * A card showing the current track looks identical whether the party is in
 * full swing or ended two hours ago. Motion is the cheapest way to say which,
 * and this is the one animation in the app that earns its place. It stops on
 * its own for anyone who has asked for reduced motion — see index.css.
 */
function NowPlayingLabel({ live }: { live: boolean }) {
  return (
    <p className="flex items-center gap-2 text-label uppercase text-brand-400">
      {live && (
        <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="eq-bar h-full w-0.5 rounded-full bg-brand-400"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      )}
      Now playing
    </p>
  )
}

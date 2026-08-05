import clsx from 'clsx'
import { AlbumArt, AppButton, AppInput, EmptyState, LoadingSkeleton } from '../../components'
import { useCatalogSearch } from './useCatalogSearch'
import {
  appleFailureMessage,
  type CatalogSong,
} from '../../services/catalog/appleCatalog'

export interface SongSearchProps {
  term: string
  onTermChange: (term: string) => void
  /** A result was chosen. */
  onPick: (song: CatalogSong) => void
  /** The escape hatch, offered on failure, on empty, and always at the end. */
  onTypeItIn: () => void
  /** Shown before anything has been typed. */
  hint?: string
  disabled?: boolean
  autoFocus?: boolean
  /** Id of the row waiting on something — the guest submits straight from here. */
  pendingId?: string | null
}

/**
 * The song search, wherever songs are chosen.
 *
 * Written for the guest's request screen and then wanted verbatim by the DJ's
 * vote builder, which was two free-text boxes — the exact problem search was
 * introduced to solve, left in place on the one screen a guest never sees.
 * Shared rather than copied so the two cannot drift: the debounce, the
 * fallback ordering, the wording when Apple is unreachable and the escape
 * hatch are one implementation.
 */
export function SongSearch({
  term,
  onTermChange,
  onPick,
  onTypeItIn,
  hint,
  disabled = false,
  autoFocus = false,
  pendingId = null,
}: SongSearchProps) {
  const { results, loading, error, empty, source, appleFailure } =
    useCatalogSearch(term)

  return (
    <>
      <AppInput
        label="Search for a song"
        hideLabel
        type="search"
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder="Song or artist"
        autoComplete="off"
        autoCorrect="off"
      />

      <div className="mt-3">
        {error && (
          <div role="alert" className="mb-4 rounded-control bg-ink-800 p-3 text-sm">
            <p className="text-danger-500">{error}</p>
            <AppButton
              variant="secondary"
              fullWidth
              className="mt-3"
              onClick={onTypeItIn}
            >
              Type the song in instead
            </AppButton>
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="space-y-2">
            <LoadingSkeleton className="h-16" />
            <LoadingSkeleton className="h-16" />
            <LoadingSkeleton className="h-16" />
          </div>
        )}

        {empty && (
          <EmptyState
            title="No songs found"
            description="Try the artist's name, or a different spelling."
            action={
              <AppButton variant="secondary" onClick={onTypeItIn}>
                Type it in instead
              </AppButton>
            }
          />
        )}

        {/* Apple's rows carry artwork; the fallbacks' do not. Without a word of
            explanation that reads as the app having got worse, rather than as
            Apple being unreachable from this phone. */}
        {source !== 'apple' && source !== null && results.length > 0 && (
          <p
            role="status"
            className="mb-3 rounded-control border border-status-pending/40 bg-status-pending/10 p-2.5 text-meta text-fg-muted"
          >
            {appleFailure
              ? appleFailureMessage(appleFailure)
              : 'Apple Music search could not be reached.'}{' '}
            {source === 'deezer'
              ? 'These are from Deezer instead — a cover can outrank the original, so check the artist.'
              : 'These are basic results — no artwork, and covers can outrank the original, so pick carefully.'}
          </p>
        )}

        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((song) => (
              <li key={song.id}>
                <SongResult
                  song={song}
                  disabled={disabled || pendingId !== null}
                  pending={pendingId === song.id}
                  onSelect={() => onPick(song)}
                />
              </li>
            ))}
          </ul>
        )}

        {hint && term.trim().length === 0 && (
          <p className="px-1 text-sm text-fg-muted">{hint}</p>
        )}

        {/* Always reachable, not only after a failure — the catalogue does not
            have everything, and nobody should end up stuck. */}
        <AppButton
          variant="ghost"
          fullWidth
          className="mt-4"
          onClick={onTypeItIn}
        >
          Can't find it? Type it in
        </AppButton>
      </div>
    </>
  )
}

interface SongResultProps {
  song: CatalogSong
  disabled: boolean
  pending: boolean
  onSelect: () => void
}

/** One search hit. The whole row is the button — it is the only action. */
function SongResult({ song, disabled, pending, onSelect }: SongResultProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={clsx(
        'flex w-full items-center gap-3 rounded-card border border-hairline bg-ink-900 p-2.5 text-left',
        'transition-colors disabled:opacity-50',
        !disabled && 'hover:bg-ink-800',
      )}
    >
      <AlbumArt url={song.artworkUrl} size="md" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-row font-semibold text-fg">
          {song.title}
        </span>
        {/* The album disambiguates: a popular song comes back several times,
            once per release, and artist alone makes those rows identical. */}
        <span className="block truncate text-meta text-fg-muted">
          {song.album ? `${song.artist} · ${song.album}` : song.artist}
        </span>
      </span>

      {pending ? (
        <span
          className="size-5 shrink-0 animate-spin rounded-full border-2 border-brand-400 border-t-transparent"
          aria-label="Sending"
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-5 shrink-0 text-fg-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  )
}

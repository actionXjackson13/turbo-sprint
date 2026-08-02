import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AppButton,
  AppInput,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
  SongRequestCard,
} from '../../components'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useGuestSession } from '../../hooks/useGuestSession'
import { useCatalogSearch } from '../../features/catalog/useCatalogSearch'
import { MAX_ACTIVE_REQUESTS_PER_GUEST } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'
import type { CatalogSong } from '../../services/catalog/appleCatalog'
import type { SongRequest } from '../../types/domain'

/**
 * Pick a song, rather than describe one.
 *
 * Two free-text fields meant a request arrived as whatever the guest managed
 * to type — misspelt, abbreviated, or the wrong artist entirely — and the DJ
 * had to work out what was meant. Searching the catalogue means the request
 * carries the actual track: exact title, exact artist, artwork, and a link
 * that opens it in Apple Music.
 */
export function RequestSongPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()
  const { event, guest } = useGuestSession()

  const [term, setTerm] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)

  /** Set when a matching request already exists, prompting an upvote instead. */
  const [duplicate, setDuplicate] = useState<SongRequest | null>(null)
  const [pending, setPending] = useState<CatalogSong | null>(null)

  const { results, loading, error, empty } = useCatalogSearch(term)

  const intakeClosed = event ? event.requestStatus !== 'open' : false
  const blocked = guest?.isBlocked ?? false
  const canSubmit = !intakeClosed && !blocked

  const send = async (song: CatalogSong, force = false) => {
    setSubmittingId(song.id)
    try {
      if (!force) {
        const match = await service.findSimilarRequest(
          eventId,
          song.title,
          song.artist,
        )
        if (match) {
          setPending(song)
          setDuplicate(match)
          return
        }
      }

      await service.createSongRequest({
        eventId,
        title: song.title,
        artist: song.artist,
        catalogId: song.id,
        artworkUrl: song.artworkUrl,
        catalogUrl: song.catalogUrl,
      })
      toast.success('Request sent to the DJ.')
      navigate(routes.guest.myRequests(eventId))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmittingId(null)
    }
  }

  const upvoteExisting = async () => {
    if (!duplicate) return
    setVoting(true)
    try {
      await service.voteRequest(duplicate.id)
      toast.success('Upvoted — the DJ will see it climbing.')
      navigate(routes.guest.requestDetails(eventId, duplicate.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setVoting(false)
    }
  }

  if (duplicate) {
    return (
      <>
        <PageHeader title="Already asked for" showBack />
        <main className="flex-1 space-y-4 px-4 py-5">
          <p className="text-sm text-fg-muted">
            Upvoting the existing request helps it rise faster than adding a
            duplicate.
          </p>

          <SongRequestCard request={duplicate} />

          <div className="space-y-2">
            <AppButton
              size="lg"
              fullWidth
              loading={voting}
              onClick={upvoteExisting}
            >
              Upvote this instead
            </AppButton>
            <AppButton
              variant="secondary"
              size="lg"
              fullWidth
              loading={submittingId !== null}
              onClick={() => pending && void send(pending, true)}
            >
              Request it anyway
            </AppButton>
            <AppButton
              variant="ghost"
              size="lg"
              fullWidth
              onClick={() => {
                setDuplicate(null)
                setPending(null)
              }}
            >
              Search again
            </AppButton>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Request a song" showBack />

      <div className="px-4 pt-2 pb-3">
        <AppInput
          label="Search for a song"
          hideLabel
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
          disabled={!canSubmit}
          placeholder="Song or artist"
          autoComplete="off"
          autoCorrect="off"
        />
      </div>

      <main className="flex-1 px-4 pb-5">
        {!canSubmit && (
          <p
            role="status"
            className="mb-4 rounded-control bg-ink-800 p-3 text-sm text-fg-muted"
          >
            {blocked
              ? 'The DJ has turned off requests for you at this event.'
              : event?.requestStatus === 'paused'
                ? 'The DJ has paused requests. Hang tight.'
                : 'Requests are closed for this event.'}
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger-500">
            {error}
          </p>
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
          />
        )}

        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((song) => (
              <li key={song.id}>
                <SongResult
                  song={song}
                  disabled={!canSubmit || submittingId !== null}
                  pending={submittingId === song.id}
                  onSelect={() => void send(song)}
                />
              </li>
            ))}
          </ul>
        )}

        {term.trim().length === 0 && (
          <p className="px-1 text-sm text-fg-muted">
            Search Apple Music for the song you want. You can have up to{' '}
            {MAX_ACTIVE_REQUESTS_PER_GUEST} requests waiting at once — your own
            counts as its first vote.
          </p>
        )}
      </main>
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
      {song.artworkUrl ? (
        <img
          src={song.artworkUrl}
          alt=""
          loading="lazy"
          className="size-12 shrink-0 rounded-control bg-ink-800 object-cover"
        />
      ) : (
        <span className="size-12 shrink-0 rounded-control bg-ink-800" />
      )}

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

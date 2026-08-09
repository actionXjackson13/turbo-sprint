import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppInput,
  PageHeader,
  SongRequestCard,
} from '../../components'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useGuestSession } from '../../hooks/useGuestSession'
import { SongSearch } from '../../features/catalog/SongSearch'
import { FIELD_LIMITS, MAX_ACTIVE_REQUESTS_PER_GUEST } from '../../data/constants'
import { validateArtist, validateSongTitle } from '../../utils/validation'
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
  /** Escape hatch when search finds nothing, or cannot be reached at all. */
  const [manual, setManual] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [manualErrors, setManualErrors] = useState<{
    title?: string
    artist?: string
  }>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)

  /** Set when a matching request already exists, prompting an upvote instead. */
  const [duplicate, setDuplicate] = useState<SongRequest | null>(null)
  const [pending, setPending] = useState<CatalogSong | null>(null)

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

  /**
   * Send a song the catalogue could not supply.
   *
   * Search is the good path, but it depends on a third party being reachable
   * from the guest's phone — and a guest who cannot search must still be able
   * to ask for a song. This is the original two-field form, kept as a fallback
   * rather than the front door.
   */
  const sendTyped = async (force = false) => {
    const next = {
      title: validateSongTitle(title) ?? undefined,
      artist: validateArtist(artist) ?? undefined,
    }
    setManualErrors(next)
    if (next.title || next.artist) return

    setSubmittingId('manual')
    try {
      if (!force) {
        const match = await service.findSimilarRequest(eventId, title, artist)
        if (match) {
          setPending(null)
          setDuplicate(match)
          return
        }
      }
      await service.createSongRequest({ eventId, title, artist })
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
    /**
     * A song already played is a different situation from one still waiting,
     * and the old screen treated them alike — offering to upvote a request the
     * DJ had already acted on, where a vote changes nothing at all. Worse, it
     * read as encouragement, when the honest answer is that a repeat is
     * unlikely to go on.
     */
    const alreadyPlayed = duplicate.status === 'played'

    const askAnyway = () =>
      pending ? void send(pending, true) : void sendTyped(true)

    return (
      <>
        <PageHeader
          title={alreadyPlayed ? 'Already played' : 'Already asked for'}
          showBack
        />
        <main className="flex-1 space-y-4 px-4 py-5">
          <p className="text-sm text-fg-muted">
            {alreadyPlayed
              ? 'The DJ has already played this tonight. You can still ask for it, but a repeat is less likely to go on than something new.'
              : 'Upvoting the existing request helps it rise faster than adding a duplicate.'}
          </p>

          <SongRequestCard
            request={duplicate}
            timestamp={alreadyPlayed ? 'played' : 'requested'}
          />

          <div className="space-y-2">
            {/*
              Asking anyway leads when the song has been played, because
              upvoting is not on the table — there is nothing left for a vote to
              move.
            */}
            {alreadyPlayed ? (
              <AppButton
                size="lg"
                fullWidth
                loading={submittingId !== null}
                onClick={askAnyway}
              >
                Request it anyway
              </AppButton>
            ) : (
              <>
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
                  onClick={askAnyway}
                >
                  Request it anyway
                </AppButton>
              </>
            )}
            <AppButton
              variant="ghost"
              size="lg"
              fullWidth
              onClick={() => {
                setDuplicate(null)
                setPending(null)
              }}
            >
              {alreadyPlayed ? 'Pick something else' : 'Search again'}
            </AppButton>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <PageHeader title={manual ? 'Type a song' : 'Request a song'} showBack />

      <main className="flex-1 px-4 pb-5 pt-2">
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

        {manual ? (
          <div className="space-y-4">
            <AppInput
              label="Song title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setManualErrors((p) => ({ ...p, title: undefined }))
              }}
              error={manualErrors.title}
              maxLength={FIELD_LIMITS.songTitle}
              autoFocus
              disabled={!canSubmit}
              placeholder="Dancing Queen"
            />
            <AppInput
              label="Artist"
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value)
                setManualErrors((p) => ({ ...p, artist: undefined }))
              }}
              error={manualErrors.artist}
              maxLength={FIELD_LIMITS.artist}
              disabled={!canSubmit}
              placeholder="ABBA"
            />
            <AppButton
              size="lg"
              fullWidth
              loading={submittingId === 'manual'}
              disabled={!canSubmit}
              onClick={() => void sendTyped()}
            >
              Send to the DJ
            </AppButton>
            <AppButton
              variant="ghost"
              size="lg"
              fullWidth
              onClick={() => setManual(false)}
            >
              Back to search
            </AppButton>
          </div>
        ) : (
          <SongSearch
            term={term}
            onTermChange={setTerm}
            onPick={(song) => void send(song)}
            onTypeItIn={() => setManual(true)}
            disabled={!canSubmit}
            autoFocus
            pendingId={submittingId}
            hint={`Search for the song you want. You can have up to ${MAX_ACTIVE_REQUESTS_PER_GUEST} requests waiting at once — your own counts as its first vote.`}
          />
        )}
      </main>
    </>
  )
}

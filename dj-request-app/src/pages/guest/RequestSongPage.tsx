import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  AppCard,
  AppInput,
  PageHeader,
  SongRequestCard,
} from '../../components'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { useGuestSession } from '../../hooks/useGuestSession'
import { validateArtist, validateSongTitle } from '../../utils/validation'
import { FIELD_LIMITS, MAX_ACTIVE_REQUESTS_PER_GUEST } from '../../data/constants'
import { getErrorMessage } from '../../utils/errors'
import type { SongRequest } from '../../types/domain'

export function RequestSongPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()
  const { event, guest } = useGuestSession()

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [errors, setErrors] = useState<{ title?: string; artist?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [voting, setVoting] = useState(false)

  /** Set when a matching request already exists, prompting an upvote instead. */
  const [duplicate, setDuplicate] = useState<SongRequest | null>(null)

  const intakeClosed = event ? event.requestStatus !== 'open' : false
  const blocked = guest?.isBlocked ?? false
  const canSubmit = !intakeClosed && !blocked

  const validate = () => {
    const next = {
      title: validateSongTitle(title) ?? undefined,
      artist: validateArtist(artist) ?? undefined,
    }
    setErrors(next)
    return !next.title && !next.artist
  }

  /** Submits, unless an existing match should be offered first. */
  const handleSubmit = async (e: FormEvent, force = false) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      if (!force) {
        const match = await service.findSimilarRequest(eventId, title, artist)
        if (match) {
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
      setSubmitting(false)
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

  return (
    <>
      <PageHeader title="Request a song" showBack />

      <main className="flex-1 px-4 py-4">
        {intakeClosed && (
          <div
            role="status"
            className="mb-4 rounded-2xl border border-status-pending/40 bg-status-pending/10 p-3 text-sm text-status-pending"
          >
            {event?.requestStatus === 'paused'
              ? 'The DJ has paused requests. Hang tight.'
              : 'Requests are closed for this event.'}
          </div>
        )}

        {blocked && (
          <div
            role="status"
            className="mb-4 rounded-2xl border border-danger-500/40 bg-danger-500/10 p-3 text-sm text-danger-500"
          >
            The DJ has turned off requests for you at this event.
          </div>
        )}

        {duplicate ? (
          <section aria-labelledby="duplicate-heading" className="space-y-4">
            <div>
              <h2
                id="duplicate-heading"
                className="text-lg font-bold text-fg"
              >
                Someone already asked for this
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Upvoting the existing request helps it rise faster than adding a
                duplicate.
              </p>
            </div>

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
                loading={submitting}
                onClick={(e) => handleSubmit(e, true)}
              >
                Request it anyway
              </AppButton>
              <AppButton
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => setDuplicate(null)}
              >
                Edit my request
              </AppButton>
            </div>
          </section>
        ) : (
          <form onSubmit={(e) => handleSubmit(e)} noValidate className="space-y-5">
            <AppInput
              label="Song title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setErrors((p) => ({ ...p, title: undefined }))
              }}
              error={errors.title}
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
                setErrors((p) => ({ ...p, artist: undefined }))
              }}
              error={errors.artist}
              maxLength={FIELD_LIMITS.artist}
              disabled={!canSubmit}
              placeholder="ABBA"
            />

            <AppButton
              type="submit"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!canSubmit}
            >
              Send to the DJ
            </AppButton>

            <AppCard>
              <p className="text-sm text-fg-muted">
                You can have up to {MAX_ACTIVE_REQUESTS_PER_GUEST} requests
                waiting at once. Your own request counts as its first vote.
              </p>
            </AppCard>
          </form>
        )}
      </main>
    </>
  )
}

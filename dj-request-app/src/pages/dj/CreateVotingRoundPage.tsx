import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlbumArt,
  AppButton,
  AppCard,
  AppInput,
  PageHeader,
} from '../../components'
import { SongPickerSheet } from './SongPickerSheet'
import type { CatalogSong } from '../../services/catalog/appleCatalog'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import {
  FIELD_LIMITS,
  MAX_VOTING_OPTIONS,
  MIN_VOTING_OPTIONS,
  VOTING_DURATIONS,
} from '../../data/constants'
import { validateArtist, validateSongTitle } from '../../utils/validation'
import { getErrorMessage } from '../../utils/errors'

interface OptionDraft {
  title: string
  artist: string
  catalogId?: string | null
  artworkUrl?: string | null
  catalogUrl?: string | null
}

const emptyOption: OptionDraft = { title: '', artist: '' }

export function CreateVotingRoundPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()

  const [options, setOptions] = useState<OptionDraft[]>([
    { ...emptyOption },
    { ...emptyOption },
  ])
  const [durationSeconds, setDurationSeconds] = useState<number | null>(60)
  const [errors, setErrors] = useState<
    Record<number, { title?: string; artist?: string }>
  >({})
  const [submitting, setSubmitting] = useState(false)

  /**
   * Which slot the search sheet is filling, and whether that slot has fallen
   * back to typing. Held per option rather than globally: a DJ may well pick
   * two songs from the catalogue and type the third, which is not in it.
   */
  const [searchingIndex, setSearchingIndex] = useState<number | null>(null)
  const [typedIndexes, setTypedIndexes] = useState<Set<number>>(new Set())

  const pick = (index: number, song: CatalogSong) => {
    update(index, {
      title: song.title,
      artist: song.artist,
      catalogId: song.id,
      artworkUrl: song.artworkUrl,
      catalogUrl: song.catalogUrl,
    })
    setSearchingIndex(null)
  }

  const typeInstead = (index: number) => {
    setTypedIndexes((prev) => new Set(prev).add(index))
    setSearchingIndex(null)
  }

  const clearOption = (index: number) => {
    update(index, {
      title: '',
      artist: '',
      catalogId: null,
      artworkUrl: null,
      catalogUrl: null,
    })
    setTypedIndexes((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }

  const update = (index: number, patch: Partial<OptionDraft>) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, ...patch } : opt)),
    )
    setErrors((prev) => ({ ...prev, [index]: {} }))
  }

  const addOption = () => {
    if (options.length >= MAX_VOTING_OPTIONS) return
    setOptions((prev) => [...prev, { ...emptyOption }])
  }

  const removeOption = (index: number) => {
    if (options.length <= MIN_VOTING_OPTIONS) return
    setOptions((prev) => prev.filter((_, i) => i !== index))
    setErrors({})
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const nextErrors: Record<number, { title?: string; artist?: string }> = {}
    options.forEach((opt, index) => {
      // An untouched slot has no song at all, which needs saying plainly
      // rather than as a validation message about a field the DJ never saw.
      if (!opt.title.trim() && !opt.artist.trim()) {
        nextErrors[index] = { title: 'Pick a song for this option.' }
        return
      }
      const titleError = validateSongTitle(opt.title)
      const artistError = validateArtist(opt.artist)
      if (titleError || artistError) {
        nextErrors[index] = {
          ...(titleError ? { title: titleError } : {}),
          ...(artistError ? { artist: artistError } : {}),
        }
      }
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await service.createVotingRound({ eventId, options, durationSeconds })
      toast.success('Vote is live.')
      navigate(routes.dj.features(eventId), { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Create a vote" showBack />

      <main className="flex-1 px-4 py-4">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <section aria-labelledby="songs-heading" className="space-y-3">
            <h2
              id="songs-heading"
              className="text-label text-fg-subtle uppercase"
            >
              Songs ({options.length} of {MAX_VOTING_OPTIONS})
            </h2>

            {options.map((option, index) => (
              <AppCard key={index}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg-muted">
                    Option {index + 1}
                  </span>
                  {options.length > MIN_VOTING_OPTIONS && (
                    <AppButton
                      size="sm"
                      variant="ghost"
                      onClick={() => removeOption(index)}
                    >
                      Remove
                    </AppButton>
                  )}
                </div>

                {option.title && !typedIndexes.has(index) ? (
                  // Picked. Shown the way the song will appear to guests, so
                  // the DJ is checking the real thing rather than their typing.
                  <div className="flex items-center gap-3">
                    <AlbumArt url={option.artworkUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-row font-semibold text-fg">
                        {option.title}
                      </p>
                      <p className="truncate text-meta text-fg-muted">
                        {option.artist}
                      </p>
                    </div>
                    <AppButton
                      size="sm"
                      variant="secondary"
                      onClick={() => clearOption(index)}
                    >
                      Change
                    </AppButton>
                  </div>
                ) : typedIndexes.has(index) ? (
                  // The escape hatch, for a song the catalogue does not have.
                  <div className="space-y-3">
                    <AppInput
                      label="Song title"
                      value={option.title}
                      onChange={(e) => update(index, { title: e.target.value })}
                      error={errors[index]?.title}
                      maxLength={FIELD_LIMITS.songTitle}
                      autoFocus
                      placeholder="September"
                    />
                    <AppInput
                      label="Artist"
                      value={option.artist}
                      onChange={(e) => update(index, { artist: e.target.value })}
                      error={errors[index]?.artist}
                      maxLength={FIELD_LIMITS.artist}
                      placeholder="Earth, Wind & Fire"
                    />
                    <AppButton
                      variant="ghost"
                      fullWidth
                      onClick={() => clearOption(index)}
                    >
                      Search instead
                    </AppButton>
                  </div>
                ) : (
                  <>
                    <AppButton
                      variant="secondary"
                      fullWidth
                      onClick={() => setSearchingIndex(index)}
                    >
                      Search for a song
                    </AppButton>
                    {errors[index]?.title && (
                      <p role="alert" className="mt-2 text-meta text-danger-500">
                        {errors[index]?.title}
                      </p>
                    )}
                  </>
                )}
              </AppCard>
            ))}

            {options.length < MAX_VOTING_OPTIONS && (
              <AppButton variant="secondary" fullWidth onClick={addOption}>
                Add another song
              </AppButton>
            )}
          </section>

          <section aria-labelledby="duration-heading">
            <h2
              id="duration-heading"
              className="mb-2 text-label text-fg-subtle uppercase"
            >
              Voting time
            </h2>
            <div
              role="radiogroup"
              aria-labelledby="duration-heading"
              className="grid grid-cols-2 gap-2"
            >
              {VOTING_DURATIONS.map((duration) => {
                const selected = durationSeconds === duration.seconds
                return (
                  <button
                    key={duration.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDurationSeconds(duration.seconds)}
                    className={clsx(
                      'min-h-12 rounded-control border text-sm font-semibold transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                        : 'border-hairline bg-ink-800 text-fg-muted hover:text-fg',
                    )}
                  >
                    {duration.label}
                  </button>
                )
              })}
            </div>
          </section>

          <AppButton type="submit" size="lg" fullWidth loading={submitting}>
            Start the vote
          </AppButton>
        </form>
      </main>

      <SongPickerSheet
        open={searchingIndex !== null}
        onPick={(song) => searchingIndex !== null && pick(searchingIndex, song)}
        onTypeItIn={() =>
          searchingIndex !== null && typeInstead(searchingIndex)
        }
        onClose={() => setSearchingIndex(null)}
      />
    </>
  )
}

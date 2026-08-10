import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppButton, AppCard, PageHeader, Section } from '../../components'
import { routes } from '../../lib/router'
import { useDjEvent } from '../../hooks/useDjEvent'
import { useService } from '../../hooks/useService'
import { useToast } from '../../hooks/useToast'
import { getErrorMessage } from '../../utils/errors'
import { isHexColor, parseHex, toHex } from '../../features/theme/color'
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  derivePalette,
  presetFor,
  themeWarning,
} from '../../features/theme/palette'
import type { EventTheme } from '../../types/domain'

/**
 * Choosing the colours the whole room sees.
 *
 * Two things shape this screen. The first is that a DJ picking colours mid-set
 * has seconds, not minutes: six ready-made pairs come first and one tap is the
 * whole interaction. The second is that whatever is chosen has to stay
 * readable, which is handled where it belongs — the palette derives lightness
 * for every role, so this screen never has to refuse a colour or explain a
 * contrast rule. It only has to show the result.
 */
export function ThemePage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const toast = useToast()
  const { event, refresh } = useDjEvent()

  const [draft, setDraft] = useState<EventTheme>(DEFAULT_THEME)
  const [saving, setSaving] = useState(false)

  // Seed once the event lands, without clobbering an edit in progress.
  useEffect(() => {
    if (event) setDraft(event.theme ?? DEFAULT_THEME)
  }, [event])

  const saved = event?.theme ?? DEFAULT_THEME
  const dirty =
    draft.primary.toLowerCase() !== saved.primary.toLowerCase() ||
    draft.accent.toLowerCase() !== saved.accent.toLowerCase()

  const warning = useMemo(() => themeWarning(draft), [draft])
  const activePreset = presetFor(draft)

  /** Null means "no theme", which is not the same as "the default one stored". */
  const save = async (theme: EventTheme | null) => {
    setSaving(true)
    try {
      await service.updateEventSettings(eventId, { theme })
      await refresh()
      toast.success('Colours updated for everyone.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!event) return null

  return (
    <>
      <PageHeader
        title="Theme"
        subtitle="Everyone in the party sees these colours."
        showBack
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        <Section title="Ready-made">
          <div className="grid grid-cols-2 gap-3">
            {THEME_PRESETS.map((preset) => (
              <PresetTile
                key={preset.id}
                name={preset.name}
                theme={preset}
                selected={activePreset?.id === preset.id}
                onSelect={() => setDraft({
                  primary: preset.primary,
                  accent: preset.accent,
                })}
              />
            ))}
          </div>
        </Section>

        <Section title="Your own">
          <AppCard>
            <div className="space-y-4">
              <p className="text-meta text-fg-muted">
                Pick any two. The app adjusts how light or dark they end up so
                text stays readable — you choose the colour, it handles the
                rest.
              </p>
              <ColorField
                label="Main colour"
                hint="Buttons, links, the tab you're on"
                value={draft.primary}
                onChange={(primary) => setDraft((d) => ({ ...d, primary }))}
              />
              <ColorField
                label="Second colour"
                hint="Highlights and dividers"
                value={draft.accent}
                onChange={(accent) => setDraft((d) => ({ ...d, accent }))}
              />
            </div>
          </AppCard>
        </Section>

        <Section title="Preview">
          <ThemePreview theme={draft} />
          {warning && (
            <p className="mt-3 text-meta text-status-pending">{warning}</p>
          )}
        </Section>

        <div className="space-y-3">
          <AppButton
            fullWidth
            size="lg"
            loading={saving}
            disabled={!dirty}
            onClick={() => void save(draft)}
          >
            {dirty ? 'Apply to everyone' : 'Applied'}
          </AppButton>

          {event.theme && (
            <AppButton
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={() => {
                setDraft(DEFAULT_THEME)
                // Cleared rather than set to the default pair: an event with no
                // theme falls through to the stylesheet, which is what a DJ who
                // never touched this screen gets.
                void save(null)
              }}
            >
              Reset to the default colours
            </AppButton>
          )}

          <AppButton
            variant="ghost"
            fullWidth
            onClick={() => navigate(routes.dj.settings(eventId))}
          >
            Back to settings
          </AppButton>
        </div>
      </main>
    </>
  )
}

/**
 * A preset as the two colours it actually produces, not as the two colours it
 * is stored as — the swatch should match the buttons the DJ is about to get.
 */
function PresetTile({
  name,
  theme,
  selected,
  onSelect,
}: {
  name: string
  theme: EventTheme
  selected: boolean
  onSelect: () => void
}) {
  const tokens = derivePalette(theme)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'flex items-center gap-3 rounded-card border p-3 text-left transition-colors',
        selected
          ? 'border-brand-400 bg-ink-800'
          : 'border-hairline bg-ink-900 active:bg-ink-800',
      ].join(' ')}
    >
      <span className="flex shrink-0 items-center">
        <span
          className="size-7 rounded-full"
          style={{ backgroundColor: tokens.brand600 }}
        />
        <span
          className="-ml-2.5 size-7 rounded-full ring-2 ring-ink-900"
          style={{ backgroundColor: tokens.accent400 }}
        />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-fg">{name}</span>
      {selected && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-brand-400"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  )
}

/**
 * The OS colour picker, plus the hex beside it.
 *
 * `<input type="color">` is the one control that is genuinely good on a phone
 * — it opens the system picker, which every guest and DJ already knows how to
 * drive — but it gives no way to type a brand colour someone was handed, hence
 * the text field next to it.
 */
function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (hex: string) => void
}) {
  const [typed, setTyped] = useState(value)

  // Follow the swatch when it moves; the field is a second view of one value.
  useEffect(() => setTyped(value), [value])

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="size-12 shrink-0 cursor-pointer rounded-control border border-hairline bg-transparent p-1"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{label}</p>
        <p className="text-meta text-fg-muted">{hint}</p>
      </div>
      <input
        type="text"
        value={typed}
        spellCheck={false}
        autoCapitalize="none"
        aria-label={`${label} hex code`}
        onChange={(e) => {
          const next = e.target.value
          setTyped(next)
          // Only commit something that is actually a colour, so the app is not
          // repainted from half-typed input.
          // Expanded to six digits: "#abc" is a fine thing to type but not a
          // value <input type="color"> will accept back.
          const parsed = isHexColor(next) ? parseHex(next) : null
          if (parsed) onChange(toHex(parsed))
        }}
        className="w-24 shrink-0 rounded-control border border-hairline bg-ink-950 px-2 py-2 text-center font-mono text-meta text-fg"
      />
    </div>
  )
}

/**
 * What the room will look like.
 *
 * Deliberately shows the awkward cases rather than a row of swatches: a filled
 * button with words on it, coloured text on a card, and a bordered chip. Those
 * are the three places a badly chosen colour would hurt, so those are the three
 * the DJ should see before pressing apply.
 */
function ThemePreview({ theme }: { theme: EventTheme }) {
  const t = derivePalette(theme)

  return (
    <div
      className="space-y-3 rounded-card border border-hairline p-4"
      style={{ backgroundColor: '#191922' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control px-4 text-sm font-medium"
          style={{ backgroundColor: t.brand600, color: t.onBrand }}
        >
          Play the queue
        </span>
        <span
          className="inline-flex min-h-11 items-center rounded-control border px-3 text-sm"
          style={{ borderColor: t.accent500, color: t.accent400 }}
        >
          Subgroup
        </span>
      </div>

      <p className="text-sm" style={{ color: t.brand400 }}>
        Requested by Maya — 3 songs ahead
      </p>
      <p className="text-meta" style={{ color: t.accent400 }}>
        Now playing · Get Lucky
      </p>
    </div>
  )
}

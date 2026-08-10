import {
  contrastRatio,
  hexToOklch,
  hueDistance,
  oklchToHex,
  oklchToRgb,
  parseHex,
  type Oklch,
  type Rgb,
} from './color'
import type { EventTheme } from '../../types/domain'

export type { EventTheme }

/**
 * Turning two colours the DJ picked into a palette that is still readable.
 *
 * The rule this file exists to enforce: **the DJ chooses hue, the app chooses
 * lightness.** A colour is used for its hue and its saturation, and then its
 * lightness is rebuilt to whatever the role needs — light enough to read as
 * text on a near-black card, dark enough to sit under white button text. So
 * there is no combination of two colours that can produce writing you cannot
 * see, because the chosen colours never land on screen unmodified.
 *
 * Every role is then *measured* afterwards and nudged until it clears its WCAG
 * threshold, because equal perceptual lightness is not equal contrast — a
 * yellow and a blue at the same OKLCH lightness are far apart on the contrast
 * formula.
 */

/** The full set of colour tokens a theme drives. */
export interface ThemeTokens {
  /** The page, then each surface raised above it. */
  ink950: string
  ink900: string
  ink800: string
  ink700: string
  ink600: string
  ink500: string
  hairline: string
  hairlineStrong: string
  fg: string
  fgMuted: string
  fgSubtle: string
  brand400: string
  brand500: string
  brand600: string
  /** Text and icons drawn *on top of* a solid brand fill. */
  onBrand: string
  accent400: string
  accent500: string
  /** Whether this palette carries light text on dark, or the other way up. */
  dark: boolean
}

const WHITE = '#ffffff'
const NEAR_BLACK = '#0a0a12'

/** Body-text contrast. Anything carrying words has to clear this. */
const TEXT_CONTRAST = 4.5
/** Non-text contrast: a border or a wash you need to be able to find. */
const EDGE_CONTRAST = 3

/**
 * Perceptual lightness for each rung of the brand ramp, chosen so the default
 * theme lands on essentially the palette this app was designed with.
 */
const TARGET = {
  brand400: 0.71,
  brand500: 0.61,
  brand600: 0.54,
  accent400: 0.8,
  accent500: 0.72,
} as const

/**
 * An upper bound on saturation. Fully saturated neons vibrate against a dark
 * background and make small text hard to focus on, which is a legibility
 * problem that contrast ratio does not capture.
 */
const MAX_CHROMA = 0.24

/**
 * And a much tighter one for the background.
 *
 * A surface fills most of the screen and sits under every piece of text on it,
 * so saturation there is felt rather than seen — a strongly coloured page is
 * tiring within a minute and leaves the brand colour nothing to stand out
 * against. The DJ's hue is kept; the intensity is not.
 */
const SURFACE_MAX_CHROMA = 0.05

/**
 * Where a background is allowed to sit.
 *
 * Two bands rather than one range, because the middle is the one place neither
 * white nor dark text is comfortable — a mid-grey page has no good foreground.
 * A colour is pulled to whichever band it is already closer to, which is the
 * same bargain the rest of this file makes: the DJ picks the colour, the app
 * picks how light it ends up.
 *
 * The dark floor sits above true black on purpose. Lightness compresses hard at
 * the bottom of sRGB, so a page at black leaves the surfaces above it barely
 * a percent apart — cards stop reading as cards, and the app flattens into one
 * dark rectangle. Just off black keeps the whole ramp.
 */
const DARK_BAND = { lo: 0.13, hi: 0.34 } as const
const LIGHT_BAND = { lo: 0.88, hi: 0.99 } as const

/**
 * How far each surface is raised above the page, in perceptual lightness.
 *
 * Measured off the palette this app already used, so the default background
 * reproduces its ramp exactly. The light-theme steps are shallower because the
 * same difference reads as a bigger jump at the top of the scale.
 */
const DARK_STEPS = [0, 0.069, 0.109, 0.152, 0.201, 0.271] as const
const LIGHT_STEPS = [0, -0.04, -0.065, -0.095, -0.13, -0.175] as const

/**
 * What each rung of text has to clear against the lightest surface it sits on.
 *
 * Contrast targets rather than fixed lightnesses, because these have to work
 * with the page either way up: "muted" means the same thing on a near-black
 * page and a near-white one, and it is not a lightness.
 */
const FG_MUTED_CONTRAST = 7
const FG_SUBTLE_CONTRAST = 5

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Walk lightness until the colour clears `minRatio` against `against`.
 *
 * Direction matters: text on a dark card has to get lighter to be readable,
 * while a fill under white text has to get darker. Stepping rather than
 * solving keeps this honest about the gamut — the conversion clamps chroma on
 * the way out, so the contrast of the colour we will actually paint is what
 * gets measured, not the contrast of an ideal one.
 */
function repair(
  base: Oklch,
  targetLightness: number,
  against: Rgb,
  minRatio: number,
  direction: 'lighter' | 'darker',
): string {
  const step = direction === 'lighter' ? 0.01 : -0.01
  const limit = direction === 'lighter' ? 0.99 : 0.03

  /**
   * Measured on the hex, not on the colour before it was rounded to it.
   *
   * A screen has 256 values per channel and the maths does not, so the last
   * step to eight bits moves the contrast slightly — enough, at the boundary,
   * for a colour that measured 4.50 to be painted at 4.4997. Rounding first and
   * measuring second is the difference between a guarantee about the palette
   * and a guarantee about an ideal version of it.
   */
  const attempt = (lightness: number): string | null => {
    const hex = oklchToHex({ ...base, l: lightness })
    const painted = parseHex(hex)!
    return contrastRatio(painted, against) >= minRatio ? hex : null
  }

  let lightness = targetLightness
  let best = oklchToHex({ ...base, l: lightness })

  for (let i = 0; i <= 100; i += 1) {
    const hit = attempt(lightness)
    if (hit) return hit
    best = oklchToHex({ ...base, l: lightness })

    lightness = clamp(lightness + step, 0.03, 0.99)
    if (direction === 'lighter' ? lightness >= limit : lightness <= limit) {
      // One last look at the extreme before giving up on it.
      return attempt(limit) ?? best
    }
  }

  // Unreachable for any real surface pair, but a palette must always come back
  // with a colour — the extreme is still the most legible one available.
  return best
}

/** Hue and chroma from the DJ's colour; a grey pick stays grey. */
function shapeOf(hex: string, fallback: string, maxChroma = MAX_CHROMA): Oklch {
  const parsed = hexToOklch(hex) ?? hexToOklch(fallback)!
  return {
    l: parsed.l,
    c: Math.min(parsed.c, maxChroma),
    h: parsed.h,
  }
}

/**
 * The page and every surface raised above it, built from one colour.
 *
 * Which way up the app runs is decided here and by nothing else: whichever
 * foreground the chosen colour carries better is the one the whole palette is
 * then built around. Everything downstream — how text is derived, which way a
 * brand colour has to move to be readable — follows from this single answer.
 */
function deriveSurfaces(background: Oklch) {
  const white = parseHex(WHITE)!
  const black = parseHex(NEAR_BLACK)!

  const asPicked = oklchToRgb(background)
  const dark =
    contrastRatio(asPicked, white) >= contrastRatio(asPicked, black)

  const band = dark ? DARK_BAND : LIGHT_BAND
  const steps = dark ? DARK_STEPS : LIGHT_STEPS
  const base = clamp(background.l, band.lo, band.hi)

  // Chroma rises a little with each step, the way the original ramp did — a
  // raised surface reads as raised partly by being slightly more colourful,
  // not only by being lighter.
  const ramp = steps.map((step, i) =>
    oklchToHex({
      l: clamp(base + step, 0.02, 0.995),
      c: Math.min(background.c * (1 + i * 0.2), SURFACE_MAX_CHROMA),
      h: background.h,
    }),
  )

  return { dark, ramp: ramp as [string, string, string, string, string, string] }
}

/**
 * Text, derived from the surface it has to be read on.
 *
 * `fg` goes to the extreme because the loudest thing on screen should be
 * unambiguous. The two quieter rungs are defined by the contrast they must
 * clear rather than by a lightness, since "muted" has to mean the same thing
 * with the page either way up — and a fixed lightness would mean the opposite.
 */
function deriveText(background: Oklch, dark: boolean, ink800: string) {
  const against = parseHex(ink800)!
  const away = dark ? 'lighter' : 'darker'

  // Tinted with the background's own hue, so text sits in the palette rather
  // than on top of it. Barely visible, and the difference is felt.
  const tint: Oklch = {
    l: 0,
    c: Math.min(background.c, 0.04),
    h: background.h,
  }

  return {
    fg: dark ? WHITE : oklchToHex({ ...tint, l: 0.18, c: Math.min(background.c, 0.03) }),
    fgMuted: repair(tint, dark ? 0.82 : 0.45, against, FG_MUTED_CONTRAST, away),
    fgSubtle: repair(tint, dark ? 0.72 : 0.55, against, FG_SUBTLE_CONTRAST, away),
  }
}

/**
 * Build the palette.
 *
 * Order is deliberate. Surfaces come first because everything else is defined
 * against them — there is no such thing as a readable brand colour in the
 * abstract, only one that is readable on this page. The solid button fill is
 * then decided before its label, since which label survives on it depends on
 * how light the fill came out, and that answer constrains the fill in turn.
 */
export function derivePalette(theme: EventTheme): ThemeTokens {
  const brand = shapeOf(theme.primary, DEFAULT_THEME.primary)
  const accent = shapeOf(theme.accent, DEFAULT_THEME.accent)
  const background = shapeOf(
    theme.background ?? DEFAULT_BACKGROUND,
    DEFAULT_BACKGROUND,
    SURFACE_MAX_CHROMA,
  )

  const { dark, ramp } = deriveSurfaces(background)
  const [ink950, ink900, ink800, ink700, ink600, ink500] = ramp
  const text = deriveText(background, dark, ink800)

  const lightest = parseHex(ink800)!
  const card = parseHex(ink900)!
  const white = parseHex(WHITE)!
  const black = parseHex(NEAR_BLACK)!

  /**
   * Which way a colour has to move to be seen against this page. On a dark
   * app that is lighter; on a light one it is exactly the opposite, and every
   * role below depends on getting this right rather than assuming a dark app.
   */
  const away = dark ? 'lighter' : 'darker'

  // Which foreground survives on this hue at button lightness. A yellow or a
  // lime cannot carry white text at any usable lightness, so it carries black
  // text instead rather than being dragged down into olive.
  const provisionalFill = oklchToRgb({ ...brand, l: TARGET.brand600 })
  const onBrandIsWhite =
    contrastRatio(provisionalFill, white) >= contrastRatio(provisionalFill, black)
  const onBrand = onBrandIsWhite ? WHITE : NEAR_BLACK

  return {
    ink950,
    ink900,
    ink800,
    ink700,
    ink600,
    ink500,
    // Edges are drawn with the foreground, not with white: a white hairline on
    // a near-white page is not an edge.
    hairline: dark ? 'rgb(255 255 255 / 0.14)' : 'rgb(0 0 0 / 0.12)',
    hairlineStrong: dark ? 'rgb(255 255 255 / 0.24)' : 'rgb(0 0 0 / 0.22)',
    ...text,
    // Text on the page: must move away from it until it can be read.
    brand400: repair(brand, TARGET.brand400, lightest, TEXT_CONTRAST, away),
    // Decorative only — borders and translucent washes. It just has to be
    // findable against a card.
    brand500: repair(brand, TARGET.brand500, card, EDGE_CONTRAST, away),
    // The primary button. Moves away from whichever foreground it carries.
    brand600: repair(
      brand,
      TARGET.brand600,
      onBrandIsWhite ? white : black,
      TEXT_CONTRAST,
      onBrandIsWhite ? 'darker' : 'lighter',
    ),
    onBrand,
    accent400: repair(accent, TARGET.accent400, lightest, TEXT_CONTRAST, away),
    accent500: repair(accent, TARGET.accent500, card, EDGE_CONTRAST, away),
    dark,
  }
}

/** CSS custom properties, named to match the `@theme` tokens in index.css. */
export function paletteVars(tokens: ThemeTokens): Record<string, string> {
  return {
    '--color-ink-950': tokens.ink950,
    '--color-ink-900': tokens.ink900,
    '--color-ink-800': tokens.ink800,
    '--color-ink-700': tokens.ink700,
    '--color-ink-600': tokens.ink600,
    '--color-ink-500': tokens.ink500,
    '--color-hairline': tokens.hairline,
    '--color-hairline-strong': tokens.hairlineStrong,
    '--color-fg': tokens.fg,
    '--color-fg-muted': tokens.fgMuted,
    '--color-fg-subtle': tokens.fgSubtle,
    '--color-brand-400': tokens.brand400,
    '--color-brand-500': tokens.brand500,
    '--color-brand-600': tokens.brand600,
    '--color-on-brand': tokens.onBrand,
    '--color-accent-400': tokens.accent400,
    '--color-accent-500': tokens.accent500,
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface ThemePreset extends EventTheme {
  id: string
  name: string
}

/**
 * Six sets that already work together, for the DJ who wants a colour and not a
 * colour-picking session. Each pair is far enough apart on the wheel that the
 * accent reads as a second colour rather than a shade of the first.
 */
export const THEME_PRESETS: ThemePreset[] = [
  // Six for a dark room, each with the page tinted very slightly toward its
  // own primary so the whole thing reads as one colour rather than an accent
  // dropped onto neutral grey.
  { id: 'midnight', name: 'Midnight', primary: '#8b5cf6', accent: '#22d3ee', background: '#0a0a12' },
  { id: 'sunset', name: 'Sunset', primary: '#fb7185', accent: '#fbbf24', background: '#140b0e' },
  { id: 'neon', name: 'Neon', primary: '#e879f9', accent: '#a3e635', background: '#120a14' },
  { id: 'ocean', name: 'Ocean', primary: '#38bdf8', accent: '#2dd4bf', background: '#07121a' },
  { id: 'ember', name: 'Ember', primary: '#f97316', accent: '#a78bfa', background: '#140f09' },
  { id: 'forest', name: 'Forest', primary: '#4ade80', accent: '#fbbf24', background: '#08130d' },
  // And two the other way up, for a daytime party — and so that a light page
  // is something the DJ can see is possible rather than has to discover.
  { id: 'daylight', name: 'Daylight', primary: '#7c3aed', accent: '#0891b2', background: '#f4f4fb' },
  { id: 'paper', name: 'Paper', primary: '#b45309', accent: '#0f766e', background: '#faf6ef' },
]

/** The page this app was designed on. */
export const DEFAULT_BACKGROUND = '#0a0a12'

/** What the app looks like when nobody has chosen anything. */
export const DEFAULT_THEME: EventTheme = {
  primary: '#8b5cf6',
  accent: '#22d3ee',
  background: DEFAULT_BACKGROUND,
}

/** The preset a theme *is*, or null when the DJ has mixed their own. */
export function presetFor(theme: EventTheme | null): ThemePreset | null {
  const target = theme ?? DEFAULT_THEME
  const background = (target.background ?? DEFAULT_BACKGROUND).toLowerCase()
  return (
    THEME_PRESETS.find(
      (p) =>
        p.primary.toLowerCase() === target.primary.toLowerCase() &&
        p.accent.toLowerCase() === target.accent.toLowerCase() &&
        p.background!.toLowerCase() === background,
    ) ?? null
  )
}

// ---------------------------------------------------------------------------
// Telling the DJ when two colours are the same colour
// ---------------------------------------------------------------------------

/**
 * Below this many degrees apart, the accent stops reading as a second colour.
 * Nothing becomes unreadable — the palette guarantees that separately — the
 * design just goes flat, which is worth a word but not worth a refusal.
 */
const MIN_HUE_SEPARATION = 25
/** Under this chroma a colour has no meaningful hue to compare. */
const GREY_CHROMA = 0.03

export function themeWarning(theme: EventTheme): string | null {
  const a = hexToOklch(theme.primary)
  const b = hexToOklch(theme.accent)
  if (!a || !b) return null

  // Two greys are two greys; there is no hue to be too close on.
  if (a.c < GREY_CHROMA && b.c < GREY_CHROMA) {
    return 'Both colours are almost grey, so highlights won’t stand out from the rest of the app.'
  }
  if (a.c < GREY_CHROMA || b.c < GREY_CHROMA) return null

  if (hueDistance(a.h, b.h) < MIN_HUE_SEPARATION) {
    return 'These two are nearly the same colour. Everything stays readable, but highlights won’t stand out from buttons.'
  }
  return null
}

/**
 * Something worth knowing, as opposed to something worth fixing.
 *
 * Kept apart from `themeWarning` deliberately. A light page is a legitimate
 * choice — two of the presets ship one — and the palette keeps it readable
 * either way up, so flagging it as a problem would be wrong. It is still the
 * kind of thing a DJ would rather hear before a room full of people is looking
 * at it.
 */
export function themeNote(theme: EventTheme): string | null {
  if (derivePalette(theme).dark) return null
  return 'A light background reads well in daylight and can be harsh in a dark room.'
}

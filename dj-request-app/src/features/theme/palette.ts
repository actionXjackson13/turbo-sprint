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
  brand400: string
  brand500: string
  brand600: string
  /** Text and icons drawn *on top of* a solid brand fill. */
  onBrand: string
  accent400: string
  accent500: string
}

// The dark surfaces a themed colour has to be legible against. These mirror
// index.css; a brand-coloured label never sits on anything lighter than
// ink-800, so that is the case worth defending.
const SURFACE_LIGHTEST = '#22222f' // --color-ink-800
const SURFACE_CARD = '#191922' // --color-ink-900

const WHITE = '#ffffff'
const NEAR_BLACK = '#0a0a12' // --color-ink-950

/** Body-text contrast. Anything carrying words has to clear this. */
const TEXT_CONTRAST = 4.5
/** Non-text contrast: a border or a wash you need to be able to find. */
const EDGE_CONTRAST = 3

/**
 * Perceptual lightness for each rung, chosen so the default theme lands on
 * essentially the palette this app was designed with.
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

  let lightness = targetLightness
  let best = { ...base, l: lightness }

  for (let i = 0; i <= 100; i += 1) {
    const candidate: Oklch = { ...base, l: lightness }
    if (contrastRatio(oklchToRgb(candidate), against) >= minRatio) {
      return oklchToHex(candidate)
    }
    best = candidate

    lightness = clamp(lightness + step, 0.03, 0.99)
    if (direction === 'lighter' ? lightness >= limit : lightness <= limit) {
      // One last look at the extreme before giving up on it.
      const edge: Oklch = { ...base, l: limit }
      if (contrastRatio(oklchToRgb(edge), against) >= minRatio) {
        return oklchToHex(edge)
      }
      break
    }
  }

  // Unreachable for any real surface pair, but a palette must always come back
  // with a colour — the extreme is still the most legible one available.
  return oklchToHex(best)
}

/** Hue and chroma from the DJ's colour; a grey pick stays grey. */
function shapeOf(hex: string, fallback: string): Oklch {
  const parsed = hexToOklch(hex) ?? hexToOklch(fallback)!
  return {
    l: parsed.l,
    c: Math.min(parsed.c, MAX_CHROMA),
    h: parsed.h,
  }
}

/**
 * Build the palette.
 *
 * Order is deliberate. The solid fill is decided first, because which
 * foreground goes on top of it — white or near-black — depends on how light it
 * came out, and that answer then constrains the fill itself.
 */
export function derivePalette(theme: EventTheme): ThemeTokens {
  const brand = shapeOf(theme.primary, DEFAULT_THEME.primary)
  const accent = shapeOf(theme.accent, DEFAULT_THEME.accent)

  const lightest = parseHex(SURFACE_LIGHTEST)!
  const card = parseHex(SURFACE_CARD)!
  const white = parseHex(WHITE)!
  const black = parseHex(NEAR_BLACK)!

  // Which foreground survives on this hue at button lightness. A yellow or a
  // lime cannot carry white text at any usable lightness, so it carries black
  // text instead rather than being dragged down into olive.
  const provisionalFill = oklchToRgb({ ...brand, l: TARGET.brand600 })
  const onBrandIsWhite =
    contrastRatio(provisionalFill, white) >= contrastRatio(provisionalFill, black)
  const onBrand = onBrandIsWhite ? WHITE : NEAR_BLACK

  return {
    // Text on dark: must get lighter until it can be read.
    brand400: repair(brand, TARGET.brand400, lightest, TEXT_CONTRAST, 'lighter'),
    // Decorative only — borders and translucent washes. It just has to be
    // findable against a card.
    brand500: repair(brand, TARGET.brand500, card, EDGE_CONTRAST, 'lighter'),
    // The primary button. Moves away from whichever foreground it carries.
    brand600: repair(
      brand,
      TARGET.brand600,
      onBrandIsWhite ? white : black,
      TEXT_CONTRAST,
      onBrandIsWhite ? 'darker' : 'lighter',
    ),
    onBrand,
    accent400: repair(accent, TARGET.accent400, lightest, TEXT_CONTRAST, 'lighter'),
    accent500: repair(accent, TARGET.accent500, card, EDGE_CONTRAST, 'lighter'),
  }
}

/** CSS custom properties, named to match the `@theme` tokens in index.css. */
export function paletteVars(tokens: ThemeTokens): Record<string, string> {
  return {
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
  { id: 'midnight', name: 'Midnight', primary: '#8b5cf6', accent: '#22d3ee' },
  { id: 'sunset', name: 'Sunset', primary: '#fb7185', accent: '#fbbf24' },
  { id: 'neon', name: 'Neon', primary: '#e879f9', accent: '#a3e635' },
  { id: 'ocean', name: 'Ocean', primary: '#38bdf8', accent: '#2dd4bf' },
  { id: 'ember', name: 'Ember', primary: '#f97316', accent: '#a78bfa' },
  { id: 'forest', name: 'Forest', primary: '#4ade80', accent: '#fbbf24' },
]

/** What the app looks like when nobody has chosen anything. */
export const DEFAULT_THEME: EventTheme = {
  primary: '#8b5cf6',
  accent: '#22d3ee',
}

/** The preset a theme *is*, or null when the DJ has mixed their own. */
export function presetFor(theme: EventTheme | null): ThemePreset | null {
  const target = theme ?? DEFAULT_THEME
  return (
    THEME_PRESETS.find(
      (p) =>
        p.primary.toLowerCase() === target.primary.toLowerCase() &&
        p.accent.toLowerCase() === target.accent.toLowerCase(),
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

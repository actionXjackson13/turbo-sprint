/**
 * Colour maths, kept free of React and of anything app-specific.
 *
 * Two spaces are needed and they do different jobs:
 *
 * - **OKLCH** is perceptually uniform, so holding lightness fixed and spinning
 *   the hue gives colours that *look* equally light. That is what makes "pick
 *   any colour you like" survivable: the palette is rebuilt at fixed lightness
 *   steps rather than from whatever the DJ happened to pick.
 * - **WCAG relative luminance** is what actually decides whether text can be
 *   read, and it is not perceptually uniform at all — yellow at OKLCH L 0.7 is
 *   far brighter to the contrast formula than blue at the same L.
 *
 * So the palette is *shaped* in OKLCH and then *verified* in WCAG. Neither one
 * alone is enough.
 */

export interface Rgb {
  /** 0–1. */
  r: number
  g: number
  b: number
}

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number
  /** Chroma. 0 is grey; ~0.37 is about as saturated as sRGB gets. */
  c: number
  /** Hue in degrees, 0–360. */
  h: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** True for `#rgb` and `#rrggbb`, with or without the hash. */
export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim())
}

/** Parses a hex colour, or returns null rather than throwing on rubbish. */
export function parseHex(value: string): Rgb | null {
  const match = HEX_PATTERN.exec(value.trim())
  if (!match) return null

  let digits = match[1] ?? ''
  // #abc means #aabbcc.
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((d) => d + d)
      .join('')
  }

  const n = parseInt(digits, 16)
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------

/** sRGB transfer function, undone. Contrast is defined on linear light. */
function toLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)
}

/**
 * And re-applied. Negatives and overshoots are carried through the linear
 * branch rather than clamped, so an out-of-gamut colour stays visibly out of
 * gamut for the check that has to notice.
 */
function fromLinear(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  )
}

/**
 * WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white).
 *
 * The thresholds that matter here: 4.5 for body text, 3 for large text and for
 * the edges of a control you have to be able to find.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Contrast between two hex colours. Unparseable input scores 1 — no contrast. */
export function contrastHex(a: string, b: string): number {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return 1
  return contrastRatio(ca, cb)
}

// ---------------------------------------------------------------------------
// OKLab / OKLCH — Björn Ottosson's matrices
// ---------------------------------------------------------------------------

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.sqrt(a * a + bb * bb)
  // atan2 returns (-180, 180]; hues read better as 0–360.
  const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360

  return { l: lightness, c: chroma, h: hue }
}

/** May land outside sRGB. Use `oklchToRgb` unless you want the raw result. */
function oklchToRgbUnclamped({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  // The matrix lands in *linear* light; sRGB is gamma-encoded, so the transfer
  // function has to go back on before these are channel values.
  return {
    r: fromLinear(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: fromLinear(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: fromLinear(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  }
}

const inGamut = ({ r, g, b }: Rgb) =>
  r >= -0.0001 && r <= 1.0001 && g >= -0.0001 && g <= 1.0001 && b >= -0.0001 && b <= 1.0001

/**
 * OKLCH to sRGB, staying in gamut by giving up chroma rather than by clipping
 * channels.
 *
 * Clipping is the obvious approach and it shifts hue: a too-saturated orange
 * clips red to 1 and slides towards yellow. Reducing chroma keeps the hue the
 * DJ picked and only makes it less vivid, which is the failure nobody notices.
 */
export function oklchToRgb(target: Oklch): Rgb {
  const direct = oklchToRgbUnclamped(target)
  if (inGamut(direct)) {
    return { r: clamp01(direct.r), g: clamp01(direct.g), b: clamp01(direct.b) }
  }

  let low = 0
  let high = target.c
  let best: Rgb = oklchToRgbUnclamped({ ...target, c: 0 })

  // 20 halvings puts chroma well inside a rounding error of the boundary.
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2
    const candidate = oklchToRgbUnclamped({ ...target, c: mid })
    if (inGamut(candidate)) {
      best = candidate
      low = mid
    } else {
      high = mid
    }
  }

  return { r: clamp01(best.r), g: clamp01(best.g), b: clamp01(best.b) }
}

export function oklchToHex(value: Oklch): string {
  return toHex(oklchToRgb(value))
}

export function hexToOklch(value: string): Oklch | null {
  const rgb = parseHex(value)
  return rgb ? rgbToOklch(rgb) : null
}

// ---------------------------------------------------------------------------
// Hue distance
// ---------------------------------------------------------------------------

/** Shortest way round the wheel, 0–180. */
export function hueDistance(a: number, b: number): number {
  const raw = Math.abs(((a - b) % 360) + 360) % 360
  return raw > 180 ? 360 - raw : raw
}

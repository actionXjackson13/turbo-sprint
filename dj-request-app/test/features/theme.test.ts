import { beforeEach, describe, expect, it } from 'vitest'
import {
  contrastHex,
  hexToOklch,
  hueDistance,
  isHexColor,
  oklchToHex,
  parseHex,
  toHex,
} from '../../src/features/theme/color'
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  derivePalette,
  paletteVars,
  presetFor,
  themeWarning,
} from '../../src/features/theme/palette'
import { DemoService } from '../../src/services/demo/DemoService'
import { resetDemoDb } from '../../src/services/demo/demoStore'
import {
  DEMO_DJ_EMAIL,
  DEMO_DJ_PASSWORD,
  DEMO_EVENT_CODE,
} from '../../src/services/demo/seed'

/**
 * The theme feature makes one promise: whatever two colours the DJ picks,
 * nobody in the room ends up unable to read the screen. Everything else here
 * is in service of being able to state that as a test rather than as a hope.
 */

// The surfaces the app actually paints, from index.css.
const INK_800 = '#22222f'
const INK_900 = '#191922'
const INK_950 = '#0a0a12'

describe('colour conversion', () => {
  it('reads both hex forms', () => {
    expect(parseHex('#fff')).toEqual(parseHex('#ffffff'))
    expect(parseHex('8b5cf6')).toEqual(parseHex('#8b5cf6'))
    expect(parseHex('nonsense')).toBeNull()
    expect(isHexColor('#12345')).toBe(false)
  })

  /**
   * The bug this catches once already: the matrix out of OKLab lands in linear
   * light, and forgetting to re-encode it made every derived colour far darker
   * than asked for — which contrast repair then "fixed" by dragging it further
   * still.
   */
  it('round-trips through OKLCH', () => {
    for (const hex of ['#8b5cf6', '#22d3ee', '#facc15', '#ffffff', '#000000', '#4ade80']) {
      const back = toHex(parseHex(oklchToHex(hexToOklch(hex)!))!)
      expect(back).toBe(hex)
    }
  })

  it('holds the lightness it was asked for', () => {
    for (const l of [0.3, 0.5, 0.71, 0.9]) {
      const measured = hexToOklch(oklchToHex({ l, c: 0.15, h: 280 }))!.l
      expect(Math.abs(measured - l)).toBeLessThan(0.01)
    }
  })

  it('keeps the hue when a colour is too saturated for the screen', () => {
    // Far outside sRGB at this lightness: chroma has to give, hue must not.
    const asked = { l: 0.55, c: 0.4, h: 30 }
    const got = hexToOklch(oklchToHex(asked))!
    expect(got.c).toBeLessThan(asked.c)
    expect(hueDistance(got.h, asked.h)).toBeLessThan(3)
  })

  it('measures contrast the way WCAG does', () => {
    expect(contrastHex('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastHex('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
})

/**
 * The load-bearing test.
 *
 * Not a handful of chosen colours — every hue on the wheel, at several
 * saturations and lightnesses, including the ones a DJ picks by accident
 * (white, black, grey) and the ones they pick on purpose at 2am (full neon).
 */
describe('no pair of colours can produce unreadable text', () => {
  const sweep: string[] = []
  for (let hue = 0; hue < 360; hue += 10) {
    for (const l of [0.25, 0.5, 0.75, 0.95]) {
      for (const c of [0.05, 0.15, 0.3]) {
        sweep.push(oklchToHex({ l, c, h: hue }))
      }
    }
  }
  sweep.push('#ffffff', '#000000', '#808080', '#010101', '#fefefe')

  it('covers the whole wheel', () => {
    expect(sweep.length).toBeGreaterThan(400)
  })

  it('keeps brand text readable on every surface it sits on', () => {
    for (const primary of sweep) {
      const { brand400 } = derivePalette({ primary, accent: '#22d3ee' })
      // ink-800 is the lightest surface a brand-coloured label sits on, so it
      // is the binding case; the darker two follow from it.
      expect(
        contrastHex(brand400, INK_800),
        `brand400 from ${primary}`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(contrastHex(brand400, INK_900)).toBeGreaterThanOrEqual(4.5)
      expect(contrastHex(brand400, INK_950)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps button labels readable on the button', () => {
    for (const primary of sweep) {
      const { brand600, onBrand } = derivePalette({ primary, accent: '#22d3ee' })
      expect(
        contrastHex(brand600, onBrand),
        `label on button from ${primary}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps accent text readable', () => {
    for (const accent of sweep) {
      const { accent400 } = derivePalette({ primary: '#8b5cf6', accent })
      expect(
        contrastHex(accent400, INK_800),
        `accent400 from ${accent}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps borders and dividers findable', () => {
    for (const primary of sweep) {
      const { brand500, accent500 } = derivePalette({ primary, accent: primary })
      expect(contrastHex(brand500, INK_900)).toBeGreaterThanOrEqual(3)
      expect(contrastHex(accent500, INK_900)).toBeGreaterThanOrEqual(3)
    }
  })

  /**
   * The two extremes deserve naming: a DJ who picks pure white and a DJ who
   * picks pure black must both end up with a usable app rather than a white
   * page or an invisible one.
   */
  it('survives white and black', () => {
    for (const pick of ['#ffffff', '#000000']) {
      const t = derivePalette({ primary: pick, accent: pick })
      expect(contrastHex(t.brand400, INK_800)).toBeGreaterThanOrEqual(4.5)
      expect(contrastHex(t.brand600, t.onBrand)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the palette the DJ actually gets', () => {
  it('leaves the default theme looking like the app already did', () => {
    const t = derivePalette(DEFAULT_THEME)
    // Not identical — these are derived rather than hand-picked — but the
    // default theme must not visibly restyle an app nobody asked to restyle.
    expect(contrastHex(t.brand400, '#a78bfa')).toBeLessThan(1.15)
    expect(contrastHex(t.brand600, '#7c3aed')).toBeLessThan(1.2)
    expect(contrastHex(t.accent400, '#22d3ee')).toBeLessThan(1.15)
  })

  it('keeps the hue that was picked', () => {
    const t = derivePalette({ primary: '#f97316', accent: '#38bdf8' })
    expect(hueDistance(hexToOklch(t.brand600)!.h, hexToOklch('#f97316')!.h)).toBeLessThan(10)
    expect(hueDistance(hexToOklch(t.accent400)!.h, hexToOklch('#38bdf8')!.h)).toBeLessThan(10)
  })

  it('names the CSS variables the stylesheet declares', () => {
    expect(Object.keys(paletteVars(derivePalette(DEFAULT_THEME))).sort()).toEqual([
      '--color-accent-400',
      '--color-accent-500',
      '--color-brand-400',
      '--color-brand-500',
      '--color-brand-600',
      '--color-on-brand',
    ])
  })

  it('recognises a preset, and knows when it is not one', () => {
    expect(presetFor(THEME_PRESETS[1]!)?.id).toBe('sunset')
    expect(presetFor(null)?.id).toBe('midnight')
    expect(presetFor({ primary: '#123456', accent: '#654321' })).toBeNull()
  })

  it('ships presets whose two colours are actually different colours', () => {
    for (const preset of THEME_PRESETS) {
      expect(themeWarning(preset), preset.name).toBeNull()
    }
  })
})

describe('warning the DJ about a flat pairing', () => {
  it('speaks up when both colours are the same hue', () => {
    expect(themeWarning({ primary: '#8b5cf6', accent: '#7c3aed' })).toMatch(
      /nearly the same/i,
    )
  })

  it('stays quiet when they are far apart', () => {
    expect(themeWarning({ primary: '#8b5cf6', accent: '#22d3ee' })).toBeNull()
  })

  it('mentions an all-grey theme', () => {
    expect(themeWarning({ primary: '#888888', accent: '#999999' })).toMatch(
      /grey/i,
    )
  })
})

describe('storing a theme', () => {
  let service: DemoService
  let eventId: string

  beforeEach(async () => {
    resetDemoDb()
    service = new DemoService()
    await service.signInDj(DEMO_DJ_EMAIL, DEMO_DJ_PASSWORD)
    eventId = (await service.getEventByCode(DEMO_EVENT_CODE))!.id
  })

  it('starts with no theme, meaning the app’s own colours', async () => {
    const event = await service.getEventById(eventId)
    expect(event?.theme).toBeNull()
  })

  /** The whole point: a guest reads the theme off the event, like everything else. */
  it('hands the DJ’s choice to anyone who looks up the event', async () => {
    await service.updateEventSettings(eventId, {
      theme: { primary: '#f97316', accent: '#38bdf8' },
    })

    const byId = await service.getEventById(eventId)
    const byCode = await service.getEventByCode(DEMO_EVENT_CODE)
    expect(byId?.theme).toEqual({ primary: '#f97316', accent: '#38bdf8' })
    expect(byCode?.theme).toEqual({ primary: '#f97316', accent: '#38bdf8' })
  })

  it('puts the default colours back', async () => {
    await service.updateEventSettings(eventId, {
      theme: { primary: '#f97316', accent: '#38bdf8' },
    })
    await service.updateEventSettings(eventId, { theme: null })
    expect((await service.getEventById(eventId))?.theme).toBeNull()
  })

  it('leaves the theme alone when something else is edited', async () => {
    const theme = { primary: '#f97316', accent: '#38bdf8' }
    await service.updateEventSettings(eventId, { theme })
    await service.updateEventSettings(eventId, { name: 'Renamed' })

    const event = await service.getEventById(eventId)
    expect(event?.name).toBe('Renamed')
    expect(event?.theme).toEqual(theme)
  })
})

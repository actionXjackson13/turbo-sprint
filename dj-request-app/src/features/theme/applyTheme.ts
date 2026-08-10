import type { EventTheme } from '../../types/domain'
import { derivePalette, paletteVars } from './palette'

/**
 * Painting a theme onto the running app.
 *
 * Tailwind 4 compiles `bg-brand-600` to `background-color: var(--color-brand-600)`,
 * so overriding those variables on the root element re-colours every screen at
 * once — no rebuild, no class swapping, and nothing in the components has to
 * know a theme exists.
 */

const STORAGE_KEY = 'soundboard.theme'

/** The variables this module writes, so clearing puts back the stylesheet. */
function rootStyle(): CSSStyleDeclaration | null {
  if (typeof document === 'undefined') return null
  return document.documentElement.style
}

export function applyTheme(theme: EventTheme | null): void {
  const style = rootStyle()
  if (!style) return

  if (!theme) {
    clearTheme()
    return
  }

  for (const [name, value] of Object.entries(paletteVars(derivePalette(theme)))) {
    style.setProperty(name, value)
  }
}

/** Hands the palette back to index.css. */
export function clearTheme(): void {
  const style = rootStyle()
  if (!style) return

  for (const name of Object.keys(paletteVars(derivePalette({ primary: '#000', accent: '#000' })))) {
    style.removeProperty(name)
  }
}

/**
 * Remember the last theme seen for an event, and paint it before the network
 * answers.
 *
 * Without this, every guest who reopens the app gets a beat of the default
 * purple before the event loads and repaints — which looks like a bug on a
 * phone that has been in a pocket, and is exactly the moment a guest is
 * looking at the screen.
 */
export function rememberTheme(eventId: string, theme: EventTheme | null): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, EventTheme | null>) : {}
    all[eventId] = theme
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // A full or blocked localStorage costs a repaint, not correctness.
  }
}

export function recallTheme(eventId: string): EventTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, EventTheme | null>
    return all[eventId] ?? null
  } catch {
    return null
  }
}

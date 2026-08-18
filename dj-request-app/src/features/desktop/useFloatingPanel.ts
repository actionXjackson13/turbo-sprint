import { useCallback, useEffect, useState } from 'react'
import { desktop } from './bridge'
import { routes } from '../../lib/router'

/**
 * How the panel gets pinned over rekordbox, by three different means.
 *
 * A DJ mixing in rekordbox has it filling the screen. A panel that sits
 * *behind* it is a panel nobody sees, so "on top of everything else" is not a
 * nicety here — it is the entire feature. Three ways to get there, best first:
 *
 *  1. **The desktop app.** Its own window, genuinely always-on-top, remembers
 *     where it was put, survives the browser being closed.
 *  2. **Document Picture-in-Picture.** Chrome and Edge will hand a page a real
 *     floating always-on-top window with arbitrary content in it, no install.
 *     Not a video player — the whole panel renders inside it.
 *  3. **A plain second window.** Everywhere else. Not on top, but a window the
 *     DJ can park on a second monitor, which is most of the value.
 *
 * The Picture-in-Picture window is populated by rendering *into* it rather than
 * navigating it — the API gives a blank document and no way to point it at a
 * URL. That turns out to be the better arrangement anyway: same React tree,
 * same session, same live data, no second page load and no second sign-in.
 */

export type PanelMode = 'desktop' | 'picture-in-picture' | 'window' | null

interface DocumentPipWindow extends Window {
  readonly document: Document
}

interface DocumentPip {
  requestWindow(options?: {
    width?: number
    height?: number
  }): Promise<DocumentPipWindow>
}

function pipApi(): DocumentPip | null {
  if (typeof window === 'undefined') return null
  const api = (window as { documentPictureInPicture?: DocumentPip })
    .documentPictureInPicture
  return api && typeof api.requestWindow === 'function' ? api : null
}

/** Narrow and tall — the shape of the space left beside a set of decks. */
const PANEL_WIDTH = 380
const PANEL_HEIGHT = 640

/**
 * The floating window starts empty, including its styles.
 *
 * Copying the page's stylesheets across is what makes the panel look like the
 * app instead of unstyled text. `adoptedStyleSheets` covers what the browser
 * has already parsed; the `<link>` and `<style>` fallback covers sheets it
 * refuses to share, which is what happens to a cross-origin stylesheet.
 */
function copyStyles(target: Document): void {
  try {
    target.adoptedStyleSheets = [...document.styleSheets]
      .map((sheet) => {
        try {
          const copy = new CSSStyleSheet()
          for (const rule of sheet.cssRules) copy.insertRule(rule.cssText)
          return copy
        } catch {
          return null
        }
      })
      .filter((sheet): sheet is CSSStyleSheet => sheet !== null)
  } catch {
    // Older engines, or a sheet that would not clone. Fall through.
  }

  for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
    target.head.append(node.cloneNode(true))
  }
}

export interface FloatingPanel {
  /** Which of the three routes this browser got, or null while closed. */
  mode: PanelMode
  /** Where to render the panel, when it is rendered in-process. */
  container: HTMLElement | null
  open: () => Promise<void>
  close: () => void
  /** Whether this browser can pin a window above other apps at all. */
  canFloat: boolean
}

export function useFloatingPanel(eventId: string): FloatingPanel {
  const [mode, setMode] = useState<PanelMode>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [pip, setPip] = useState<DocumentPipWindow | null>(null)

  const canFloat = Boolean(desktop()) || pipApi() !== null

  const close = useCallback(() => {
    desktop()?.closePanel()
    pip?.close()
    setPip(null)
    setContainer(null)
    setMode(null)
  }, [pip])

  const open = useCallback(async () => {
    const shell = desktop()
    if (shell) {
      shell.openPanel(eventId)
      setMode('desktop')
      return
    }

    const api = pipApi()
    if (api) {
      try {
        const win = await api.requestWindow({
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
        })
        copyStyles(win.document)
        // The host page paints its own background; a transparent panel would
        // show the browser's default white through the party's dark theme.
        win.document.body.classList.add('bg-ink-950', 'text-fg')
        const host = win.document.createElement('div')
        host.style.height = '100%'
        win.document.body.append(host)

        setPip(win)
        setContainer(host)
        setMode('picture-in-picture')
        return
      } catch {
        // Refused — no user gesture, or one is already open. Fall through to a
        // plain window rather than leaving the DJ with nothing.
      }
    }

    window.open(
      `${window.location.pathname}#${routes.dj.panel(eventId)}`,
      'soundboard-panel',
      `popup=yes,width=${PANEL_WIDTH},height=${PANEL_HEIGHT}`,
    )
    setMode('window')
  }, [eventId])

  // The panel never outlives the page that opened it, and the DJ can close it
  // from its own title bar — so the button has to notice when that happens.
  useEffect(() => {
    if (!pip) return
    const onClose = () => {
      setPip(null)
      setContainer(null)
      setMode(null)
    }
    pip.addEventListener('pagehide', onClose)
    return () => pip.removeEventListener('pagehide', onClose)
  }, [pip])

  return { mode, container, open, close, canFloat }
}

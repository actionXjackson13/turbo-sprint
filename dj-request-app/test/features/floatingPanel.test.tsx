import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFloatingPanel } from '../../src/features/desktop/useFloatingPanel'
import { isDesktopApp } from '../../src/features/desktop/bridge'

/**
 * Getting the panel above rekordbox, by whichever means this machine has.
 *
 * A DJ mixing has rekordbox filling the screen, so a panel that opens *behind*
 * it is a panel nobody sees — "on top" is the feature, not a detail of it.
 * There are three ways to get there and they are not equally good, so what
 * matters is that the best available one is chosen and that a machine with none
 * of them still ends up with something.
 *
 * The bit worth defending hardest is the fall-through: a Picture-in-Picture
 * request is refused for reasons that only show up in front of a real user —
 * no gesture on the call stack, one already open, the feature disabled by
 * policy — and a DJ who taps the button mid-party must not be left with
 * nothing at all.
 */

const openWindow = vi.fn()
const requestWindow = vi.fn()

function fakePipWindow() {
  const doc = document.implementation.createHTMLDocument('panel')
  return {
    document: doc,
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

beforeEach(() => {
  openWindow.mockReset()
  requestWindow.mockReset()
  vi.stubGlobal('open', openWindow)
  delete (window as { documentPictureInPicture?: unknown })
    .documentPictureInPicture
  delete (window as { soundboard?: unknown }).soundboard
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { documentPictureInPicture?: unknown })
    .documentPictureInPicture
  delete (window as { soundboard?: unknown }).soundboard
})

function installShell() {
  const shell = {
    version: '1.0.0',
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    isPanelOpen: vi.fn(async () => true),
    keepAwake: vi.fn(),
  }
  ;(window as { soundboard?: unknown }).soundboard = shell
  return shell
}

function installPip() {
  ;(window as { documentPictureInPicture?: unknown }).documentPictureInPicture =
    { requestWindow }
}

describe('opening the floating panel', () => {
  it('knows it is in a plain browser', () => {
    expect(isDesktopApp()).toBe(false)
  })

  it('offers nothing to float on a browser that cannot', () => {
    const { result } = renderHook(() => useFloatingPanel('e1'))
    expect(result.current.canFloat).toBe(false)
    expect(result.current.mode).toBeNull()
  })

  it('uses the desktop app when it is there', async () => {
    const shell = installShell()
    const { result } = renderHook(() => useFloatingPanel('e1'))

    expect(result.current.canFloat).toBe(true)
    await act(() => result.current.open())

    expect(shell.openPanel).toHaveBeenCalledWith('e1')
    expect(result.current.mode).toBe('desktop')
    // Its own window: nothing to render in this process.
    expect(result.current.container).toBeNull()
    expect(requestWindow).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('closes the desktop panel again', async () => {
    const shell = installShell()
    const { result } = renderHook(() => useFloatingPanel('e1'))

    await act(() => result.current.open())
    act(() => result.current.close())

    expect(shell.closePanel).toHaveBeenCalled()
    expect(result.current.mode).toBeNull()
  })

  /**
   * The browser hands back a blank window; the panel is rendered into it. So
   * the hook's job is to produce somewhere to render, styled like the app —
   * an unstyled panel is worse than no panel.
   */
  it('renders into a picture-in-picture window in a browser that has one', async () => {
    installPip()
    const win = fakePipWindow()
    requestWindow.mockResolvedValue(win)

    const { result } = renderHook(() => useFloatingPanel('e1'))
    expect(result.current.canFloat).toBe(true)

    await act(() => result.current.open())

    expect(result.current.mode).toBe('picture-in-picture')
    expect(result.current.container).not.toBeNull()
    expect(win.document.body.contains(result.current.container)).toBe(true)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('paints the floating window rather than leaving it transparent', async () => {
    installPip()
    const win = fakePipWindow()
    requestWindow.mockResolvedValue(win)

    const { result } = renderHook(() => useFloatingPanel('e1'))
    await act(() => result.current.open())

    expect(win.document.body.classList.contains('bg-ink-950')).toBe(true)
  })

  /** The bug this guards: a refused request leaving the DJ with nothing. */
  it('falls back to a plain window when the request is refused', async () => {
    installPip()
    requestWindow.mockRejectedValue(new Error('needs a user gesture'))

    const { result } = renderHook(() => useFloatingPanel('e1'))
    await act(() => result.current.open())

    expect(result.current.mode).toBe('window')
    expect(openWindow).toHaveBeenCalled()
    expect(String(openWindow.mock.calls[0]?.[0])).toContain('/dj/panel/e1')
  })

  it('closes the floating window when asked', async () => {
    installPip()
    const win = fakePipWindow()
    requestWindow.mockResolvedValue(win)

    const { result } = renderHook(() => useFloatingPanel('e1'))
    await act(() => result.current.open())
    act(() => result.current.close())

    expect(win.close).toHaveBeenCalled()
    expect(result.current.container).toBeNull()
    expect(result.current.mode).toBeNull()
  })

  /**
   * The DJ can close the panel from its own title bar, and the button has to
   * notice — otherwise it goes on saying "Close the panel" for a panel that is
   * no longer there.
   */
  it('notices the floating window being closed from outside', async () => {
    installPip()
    const win = fakePipWindow()
    requestWindow.mockResolvedValue(win)

    const { result } = renderHook(() => useFloatingPanel('e1'))
    await act(() => result.current.open())

    const [event, handler] = win.addEventListener.mock.calls[0] ?? []
    expect(event).toBe('pagehide')
    act(() => (handler as () => void)())

    expect(result.current.mode).toBeNull()
    expect(result.current.container).toBeNull()
  })
})

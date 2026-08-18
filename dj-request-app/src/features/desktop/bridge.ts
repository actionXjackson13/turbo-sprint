/**
 * What the desktop app offers the web app, and how the web app finds out.
 *
 * SoundBoard is one codebase served from one place. The desktop app does not
 * bundle a copy of it — it loads the live site — so this file is the only thing
 * that knows there is a difference, and every screen behind it stays the screen
 * it already was.
 *
 * That arrangement is deliberate: it means a change to the app reaches the
 * laptop without anybody reinstalling anything, and it means the desktop shell
 * can stay small enough to be worth trusting. The shell owns the things only a
 * real window can do — floating above rekordbox, sitting in the tray, keeping
 * the machine awake — and nothing else.
 *
 * Everything here is written to be absent. In a browser `window.soundboard` is
 * simply undefined, every call is a no-op, and the pop-out falls back to the
 * browser's own always-on-top window.
 */

export interface DesktopBridge {
  /** Marks this as our shell, and says which build of it. */
  readonly version: string
  /** Opens (or focuses) the floating panel on the given event. */
  openPanel(eventId: string): void
  /** Closes it. */
  closePanel(): void
  /** Whether the panel window is open right now. */
  isPanelOpen(): Promise<boolean>
  /**
   * Asks the shell to keep the machine awake, or stop.
   *
   * A laptop that sleeps mid-set takes the requests with it. The browser's
   * wake lock only holds while a tab is visible, which is exactly the thing a
   * DJ working in rekordbox cannot promise.
   */
  keepAwake(on: boolean): void
}

declare global {
  interface Window {
    soundboard?: DesktopBridge
  }
}

/** The shell, when the app is running inside it. */
export function desktop(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  return window.soundboard ?? null
}

export function isDesktopApp(): boolean {
  return desktop() !== null
}

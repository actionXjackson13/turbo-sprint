import { describe, expect, it, beforeAll } from 'vitest'
import { lockViewport } from '../../src/lib/viewportLock'

/**
 * The pinch suppression, and — just as important — what it leaves alone. A
 * blanket `preventDefault` on touchmove would take scrolling and the queue's
 * drag-to-reorder with it, which is the obvious way to get this wrong.
 */
beforeAll(() => {
  lockViewport()
})

function touchMove(fingers: number): Event {
  const event = new Event('touchmove', { bubbles: true, cancelable: true })
  // jsdom has no TouchEvent; the handler only reads `touches.length`.
  Object.defineProperty(event, 'touches', {
    value: { length: fingers },
  })
  return event
}

describe('lockViewport', () => {
  it('swallows a two-finger pinch', () => {
    const event = touchMove(2)
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves one finger alone, so scrolling and dragging still work', () => {
    const event = touchMove(1)
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  /**
   * WebKit's own pinch events, and the only thing that stops a zoom on an
   * iPhone — the viewport meta has been ignored there since iOS 10.
   */
  it.each(['gesturestart', 'gesturechange', 'gestureend'])(
    'swallows %s, which is how Safari reports a pinch',
    (type) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      document.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    },
  )

  it('survives a browser with no orientation lock, as iOS has none', () => {
    // Already called in beforeAll against jsdom, which provides no
    // screen.orientation at all — reaching here at all is the assertion.
    expect(() => lockViewport()).not.toThrow()
  })
})

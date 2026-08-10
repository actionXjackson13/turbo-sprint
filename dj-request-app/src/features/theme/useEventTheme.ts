import { useEffect } from 'react'
import type { EventTheme } from '../../types/domain'
import { applyTheme, clearTheme, recallTheme, rememberTheme } from './applyTheme'

/**
 * Keeps the running app painted in the current event's colours.
 *
 * Called from the two layouts that own an event — the DJ's and the guest's —
 * rather than from a provider of its own, because that is exactly the span the
 * theme should last: entering an event paints it, leaving it puts the app's own
 * colours back, and a DJ with two parties open in two tabs gets the right one
 * in each.
 *
 * `theme` arrives as undefined while the event loads. That is deliberately not
 * treated as "no theme" — the cached colours from last time stay up instead, so
 * the screen does not flash the default palette on the way in.
 */
export function useEventTheme(
  eventId: string | null,
  theme: EventTheme | null | undefined,
): void {
  // Paint from cache the moment an event id is known, before any request has
  // come back.
  useEffect(() => {
    if (!eventId) return
    const remembered = recallTheme(eventId)
    if (remembered) applyTheme(remembered)
  }, [eventId])

  useEffect(() => {
    if (!eventId || theme === undefined) return
    applyTheme(theme)
    rememberTheme(eventId, theme)
  }, [eventId, theme])

  // Leaving the event — not merely re-rendering — puts the palette back.
  useEffect(() => {
    if (!eventId) return
    return () => clearTheme()
  }, [eventId])
}

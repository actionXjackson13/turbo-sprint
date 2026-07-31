import { useCallback, useEffect, useState } from 'react'
import {
  getActiveDemoPersona,
  listDemoPersonas,
  subscribeDemoRoster,
  type DemoPersona,
} from '../services/demo/demoIdentity'

export interface DemoPersonasState {
  /** Everyone who has joined this event, in join order. */
  personas: DemoPersona[]
  /** Whoever the demo is currently acting as. */
  active: DemoPersona | null
}

/**
 * Live view of the demo roster. Demo-mode only — call it from components that
 * are rendered behind an `isDemoMode()` check.
 */
export function useDemoPersonas(eventId: string): DemoPersonasState {
  const read = useCallback(
    () => ({
      personas: listDemoPersonas(eventId),
      active: getActiveDemoPersona(eventId),
    }),
    [eventId],
  )

  const [state, setState] = useState(read)

  useEffect(() => {
    setState(read())
    return subscribeDemoRoster(eventId, () => setState(read()))
  }, [eventId, read])

  return state
}

import { createContext } from 'react'
import type { AutoAcceptState } from '../features/requests/useAutoAccept'

/**
 * Auto accept is a context for the same reason playback is: it has to keep
 * working while the DJ is looking at something else.
 *
 * Run from the requests screen it only ran *on* the requests screen — leave the
 * tab and guests' songs stopped being queued until somebody came back, which is
 * the opposite of what "auto" is for.
 */
export const AutoAcceptContext = createContext<AutoAcceptState | null>(null)

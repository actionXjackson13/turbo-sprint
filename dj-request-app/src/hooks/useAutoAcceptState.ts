import { useContext } from 'react'
import { AutoAcceptContext } from '../contexts/autoAcceptContext'
import type { AutoAcceptState } from '../features/requests/useAutoAccept'

export function useAutoAcceptState(): AutoAcceptState {
  const ctx = useContext(AutoAcceptContext)
  if (!ctx) {
    throw new Error(
      'useAutoAcceptState must be used within an <AutoAcceptProvider>',
    )
  }
  return ctx
}

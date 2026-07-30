import { useContext } from 'react'
import { DjAuthContext, type DjAuthValue } from '../contexts/djAuthContext'

export function useDjAuth(): DjAuthValue {
  const ctx = useContext(DjAuthContext)
  if (!ctx) {
    throw new Error('useDjAuth must be used within a <DjAuthProvider>')
  }
  return ctx
}

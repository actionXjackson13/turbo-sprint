import { useContext } from 'react'
import { DjEventContext, type DjEventValue } from '../contexts/djEventContext'

export function useDjEvent(): DjEventValue {
  const ctx = useContext(DjEventContext)
  if (!ctx) {
    throw new Error('useDjEvent must be used within a <DjEventProvider>')
  }
  return ctx
}

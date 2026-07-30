import { useContext } from 'react'
import { ServiceContext } from '../contexts/serviceContext'
import type { DataService } from '../services/types'

export function useService(): DataService {
  const service = useContext(ServiceContext)
  if (!service) {
    throw new Error('useService must be used within a <ServiceProvider>')
  }
  return service
}

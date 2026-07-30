import { createContext } from 'react'
import type { ToastVariant } from '../components/Toast'

export interface ToastApi {
  show: (message: string, variant?: ToastVariant) => void
  success: (message: string) => void
  error: (message: string) => void
  dismiss: (id: string) => void
}

/**
 * Lives in its own module so ToastContext.tsx exports only the provider
 * component, which Fast Refresh requires.
 */
export const ToastContext = createContext<ToastApi | null>(null)

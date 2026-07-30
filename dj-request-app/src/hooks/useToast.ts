import { useContext } from 'react'
import { ToastContext, type ToastApi } from '../contexts/toastContext'

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}

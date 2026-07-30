import { ServiceError } from '../services/types'

/**
 * Turns an unknown thrown value into something worth showing a guest.
 * ServiceError messages are written for users; anything else is not, so it is
 * logged and replaced with a generic line.
 */
export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof ServiceError) return error.message

  if (error instanceof Error) {
    console.error(error)
    // Offline and DNS failures surface as TypeError from fetch.
    if (error.name === 'TypeError' && /fetch|network/i.test(error.message)) {
      return 'You appear to be offline. Check your connection and try again.'
    }
  } else {
    console.error('Non-error thrown:', error)
  }

  return fallback
}

export function isServiceErrorCode(
  error: unknown,
  code: ServiceError['code'],
): boolean {
  return error instanceof ServiceError && error.code === code
}

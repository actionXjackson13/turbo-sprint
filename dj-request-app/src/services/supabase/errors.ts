import { ServiceError, type ServiceErrorCode } from '../types'

const KNOWN_CODES: ServiceErrorCode[] = [
  'not_found',
  'unauthorized',
  'forbidden',
  'blocked',
  'requests_closed',
  'limit_reached',
  'duplicate',
  'round_closed',
  'invalid_input',
  'network',
  'unknown',
]

/**
 * Translates a Postgres/PostgREST error into a ServiceError.
 *
 * The SECURITY DEFINER functions in 0002 raise messages shaped as
 * `code: human readable sentence`, so the UI can react to the code while
 * showing the sentence verbatim.
 */
export function translateError(error: unknown, fallbackMessage: string): never {
  const raw = error as { message?: string; code?: string; details?: string }
  const message = raw?.message ?? ''

  const [maybeCode, ...rest] = message.split(':')
  const trimmedCode = maybeCode?.trim() as ServiceErrorCode | undefined

  if (trimmedCode && KNOWN_CODES.includes(trimmedCode) && rest.length > 0) {
    const text = rest.join(':').trim()
    throw new ServiceError(
      trimmedCode,
      text.charAt(0).toUpperCase() + text.slice(1) + '.',
    )
  }

  // PostgREST/Postgres codes we can map without a custom message.
  switch (raw?.code) {
    case '23505': // unique_violation
      throw new ServiceError('duplicate', 'That already exists.')
    case '42501': // insufficient_privilege — an RLS policy refused the write
      throw new ServiceError(
        'forbidden',
        'You do not have permission to do that.',
      )
    case 'PGRST116': // no rows returned where one was required
      throw new ServiceError('not_found', 'That could not be found.')
    default:
      break
  }

  if (message.toLowerCase().includes('failed to fetch')) {
    throw new ServiceError(
      'network',
      'You appear to be offline. Check your connection and try again.',
    )
  }

  console.error('Unmapped Supabase error:', error)
  throw new ServiceError('unknown', fallbackMessage)
}

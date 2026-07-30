import { EVENT_CODE_LENGTH, FIELD_LIMITS } from '../data/constants'

export type ValidationResult = string | null

/** Returns an error message, or null when the value is acceptable. */
export function validateRequired(
  value: string,
  label: string,
  maxLength: number,
): ValidationResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) return `${label} is required.`
  if (trimmed.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`
  }
  return null
}

export function validateSongTitle(value: string): ValidationResult {
  return validateRequired(value, 'Song title', FIELD_LIMITS.songTitle)
}

export function validateArtist(value: string): ValidationResult {
  return validateRequired(value, 'Artist', FIELD_LIMITS.artist)
}

export function validateDisplayName(value: string): ValidationResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Please enter a name.'
  if (trimmed.length < 2) return 'Name must be at least 2 characters.'
  if (trimmed.length > FIELD_LIMITS.displayName) {
    return `Name must be ${FIELD_LIMITS.displayName} characters or fewer.`
  }
  return null
}

export function validateEventName(value: string): ValidationResult {
  return validateRequired(value, 'Event name', FIELD_LIMITS.eventName)
}

export function validateEventCode(value: string): ValidationResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Enter the event code.'
  if (trimmed.length !== EVENT_CODE_LENGTH) {
    return `Event codes are ${EVENT_CODE_LENGTH} characters.`
  }
  return null
}

export function validateEmail(value: string): ValidationResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Email is required.'
  // Intentionally permissive: the real check is the confirmation email.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid email address.'
  }
  return null
}

export function validatePassword(value: string): ValidationResult {
  if (value.length === 0) return 'Password is required.'
  // Matches Supabase Auth's default minimum.
  if (value.length < 6) return 'Password must be at least 6 characters.'
  return null
}

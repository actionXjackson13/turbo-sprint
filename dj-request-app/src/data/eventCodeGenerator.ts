import { EVENT_CODE_LENGTH } from './constants'

/**
 * Alphabet for shareable join codes. Deliberately excludes characters that are
 * easily confused when read aloud or off a screen across a dark room:
 * I/1, O/0, S/5, Z/2, B/8.
 */
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679'

export function generateEventCode(length = EVENT_CODE_LENGTH): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  let code = ''
  for (let i = 0; i < length; i++) {
    // Modulo bias is negligible at this alphabet size and codes are checked
    // for collisions by the caller anyway.
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  }
  return code
}

/** Normalises user-typed codes: uppercase, no spaces or dashes. */
export function normalizeEventCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

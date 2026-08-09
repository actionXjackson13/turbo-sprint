import { useCallback, useState } from 'react'
import type { CatalogChoice } from '../../services/catalog/appleCatalog'

/**
 * Which catalogue this device searches, remembered.
 *
 * Worth persisting rather than defaulting every time: the reason someone
 * changes it is that the automatic choice is going wrong *here* — a venue whose
 * WiFi Apple has rate-limited, a phone with a content blocker on
 * itunes.apple.com — and those conditions last all night. Re-picking Deezer for
 * every song would be the app forgetting something it was just told.
 *
 * Per device, not per event. It describes this phone's connection, which is
 * not a fact about the party.
 */

const KEY = 'soundboard.catalog.source'

const VALID: readonly CatalogChoice[] = [
  'auto',
  'apple',
  'deezer',
  'musicbrainz',
]

export function getCatalogChoice(): CatalogChoice {
  try {
    const stored = localStorage.getItem(KEY) as CatalogChoice | null
    return stored && VALID.includes(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function setCatalogChoice(choice: CatalogChoice): void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Storage blocked. The choice simply will not survive a reload.
  }
}

/** State plus persistence, so every search screen behaves the same way. */
export function useCatalogChoice(): [CatalogChoice, (c: CatalogChoice) => void] {
  const [choice, setChoice] = useState<CatalogChoice>(getCatalogChoice)

  const change = useCallback((next: CatalogChoice) => {
    setChoice(next)
    setCatalogChoice(next)
  }, [])

  return [choice, change]
}

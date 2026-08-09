import { useState } from 'react'
import { AppButton, AppCard, AppInput, EmptyState } from '../../../components'
import { useToast } from '../../../hooks/useToast'
import {
  addBlocked,
  listBlocked,
  removeBlocked,
} from '../../../features/requests/blocklist'
import { isAutoAcceptOn } from '../../../features/requests/useAutoAccept'
import { useParams } from 'react-router-dom'

/**
 * Songs the DJ never plays.
 *
 * The list is only acted on while auto accept is running — that is the whole
 * point of it. With auto accept off the DJ is reading every request anyway and
 * can decline by hand; with it on, this is the only thing standing between
 * "take everything" and actually taking everything.
 *
 * Saying so on the screen matters more than it looks. A blocklist that quietly
 * does nothing is worse than no blocklist, because the DJ stops watching.
 */
export function BlockedPanel() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const toast = useToast()

  const [entries, setEntries] = useState(listBlocked)
  const [term, setTerm] = useState('')

  const add = () => {
    if (!term.trim()) return
    setEntries(addBlocked(term))
    setTerm('')
    toast.success(`“${term.trim()}” won’t be accepted.`)
  }

  const autoAcceptOff = !isAutoAcceptOn(eventId)

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Requests matching anything here are declined automatically. A word is
        enough — a title, an artist, or part of either.
      </p>

      {/* A list that quietly does nothing is worse than no list at all. */}
      {autoAcceptOff && entries.length > 0 && (
        <p className="rounded-control border border-status-pending/40 bg-status-pending/10 p-2.5 text-meta text-fg-muted">
          Auto accept is off, so nothing is being declined automatically right
          now. Turn it on from the Requests tab.
        </p>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <AppInput
            label="Block a song or artist"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Baby Shark"
            maxLength={80}
          />
        </div>
        <AppButton disabled={!term.trim()} onClick={add}>
          Block
        </AppButton>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing blocked"
          description="Add a song or an artist and it will never reach the queue."
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.key}>
              <AppCard className="flex items-center gap-3 !py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                  {entry.text}
                </span>
                <AppButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setEntries(removeBlocked(entry.key))}
                >
                  Unblock
                </AppButton>
              </AppCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

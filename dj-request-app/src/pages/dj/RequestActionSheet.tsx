import { ActionSheet, type ActionSheetItem } from '../../components'
import {
  appleMusicLinkFor,
  canHandOff,
  handOffToAppleMusic,
} from '../../features/appleMusic/handoff'
import { cardActionLabels } from './cardActionLabels'
import type { RequestStatus, SongRequest } from '../../types/domain'

export interface RequestActionSheetProps {
  /** The request whose menu is open, or null when closed. */
  request: SongRequest | null
  onClose: () => void
  onSetStatus: (id: string, status: RequestStatus) => void
  onPlayNext: (request: SongRequest) => void
  /** Omitted on the control panel — destructive moves live on Requests. */
  onRemove?: (request: SongRequest) => void
  onBlock?: (request: SongRequest) => void
  onOpenDetails?: (request: SongRequest) => void
}

/**
 * Everything a DJ can do to a request that did not earn a place on the card.
 *
 * Cards previously carried up to seven buttons at once. The two moves a DJ
 * makes constantly stay in front of them; the rest are here, grouped and
 * labelled with what will actually happen.
 */
export function RequestActionSheet({
  request,
  onClose,
  onSetStatus,
  onPlayNext,
  onRemove,
  onBlock,
  onOpenDetails,
}: RequestActionSheetProps) {
  if (!request) return null

  const items: ActionSheetItem[] = []

  /**
   * Getting the song into the DJ's own player. First in the list because on a
   * night that is running well it is the only thing they want from this sheet.
   */
  if (canHandOff()) {
    items.push({
      label: 'Add to Apple Music',
      onSelect: () => handOffToAppleMusic(request),
    })
  }

  const appleLink = appleMusicLinkFor(request)
  if (appleLink) {
    items.push({
      label: 'Open in Apple Music',
      onSelect: () => window.open(appleLink, '_blank', 'noopener'),
    })
  }
  const { status } = request
  const onCard = cardActionLabels(status)

  if (onOpenDetails) {
    items.push({ label: 'View details', onSelect: () => onOpenDetails(request) })
  }

  if (status !== 'queued') {
    items.push({ label: 'Play Next', onSelect: () => onPlayNext(request) })
    items.push({
      label: 'Add to Queue',
      onSelect: () => onSetStatus(request.id, 'queued'),
    })
  }

  if (status === 'pending') {
    items.push({
      label: 'Accept',
      onSelect: () => onSetStatus(request.id, 'accepted'),
    })
  }

  if (status === 'queued') {
    items.push({
      label: 'Mark as Played',
      onSelect: () => onSetStatus(request.id, 'played'),
    })
    items.push({
      label: 'Remove from Queue',
      onSelect: () => onSetStatus(request.id, 'accepted'),
    })
  }

  if (status === 'pending' || status === 'accepted' || status === 'queued') {
    items.push({
      label: 'Decline',
      onSelect: () => onSetStatus(request.id, 'declined'),
    })
  }

  if (status === 'played' || status === 'declined') {
    items.push({
      label: 'Reopen',
      onSelect: () => onSetStatus(request.id, 'pending'),
    })
  }

  if (onRemove) {
    items.push({
      label: 'Delete request',
      destructive: true,
      onSelect: () => onRemove(request),
    })
  }

  // Winners promoted from a vote have no guest to block.
  if (onBlock && request.guestId) {
    items.push({
      label: `Block ${request.guestDisplayName}`,
      destructive: true,
      onSelect: () => onBlock(request),
    })
  }

  return (
    <ActionSheet
      open
      title={request.title}
      description={request.artist}
      // Never repeat what the card already offers — a menu that echoes the
      // buttons above it reads as two ways of doing the same thing.
      items={items.filter((item) => !onCard.includes(item.label))}
      onClose={onClose}
    />
  )
}

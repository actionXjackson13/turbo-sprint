import { useParams } from 'react-router-dom'
import { GuestManager, PageHeader } from '../../components'
import { useDjEvent } from '../../hooks/useDjEvent'

/**
 * Everyone in the room, on their own screen.
 *
 * It used to sit inline on Settings, where a busy party pushed everything below
 * it — ending the event included — off the bottom of the page. A guest list is
 * unbounded; a settings screen should not be.
 */
export function GuestsPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const { guestCount } = useDjEvent()

  return (
    <>
      <PageHeader
        title="Guests"
        subtitle={`${guestCount} ${guestCount === 1 ? 'person' : 'people'} joined`}
        showBack
      />
      <main className="flex-1 px-4 py-5">
        <GuestManager eventId={eventId} />
      </main>
    </>
  )
}

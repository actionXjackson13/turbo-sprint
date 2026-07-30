import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  EmptyState,
  PageHeader,
  SongRequestCard,
  SongRequestListSkeleton,
} from '../../components'
import { routes } from '../../lib/router'
import { useService } from '../../hooks/useService'
import { useLiveData } from '../../hooks/useAsyncData'
import { useGuestSession } from '../../hooks/useGuestSession'
import { ACTIVE_REQUEST_STATUSES } from '../../types/domain'
import { MAX_ACTIVE_REQUESTS_PER_GUEST } from '../../data/constants'

/**
 * The guest's own requests, with live status. Because this subscribes to the
 * event's request channel, a DJ accepting or declining updates it immediately.
 */
export function MyRequestsPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const service = useService()
  const { event } = useGuestSession()

  const loader = useCallback(
    () => service.getMyRequests(eventId),
    [service, eventId],
  )
  const subscribe = useCallback(
    (onChange: () => void) => service.subscribeSongRequests(eventId, onChange),
    [service, eventId],
  )

  const { data, loading, error } = useLiveData(loader, subscribe)
  const requests = data ?? []

  const activeCount = requests.filter((r) =>
    (ACTIVE_REQUEST_STATUSES as readonly string[]).includes(r.status),
  ).length

  return (
    <>
      <PageHeader
        title="My requests"
        subtitle={
          requests.length > 0
            ? `${activeCount} of ${MAX_ACTIVE_REQUESTS_PER_GUEST} active`
            : undefined
        }
        showBack
      />

      <main className="flex-1 px-4 py-4">
        {error && (
          <p role="alert" className="mb-4 text-sm text-danger-500">
            {error}
          </p>
        )}

        {loading && requests.length === 0 ? (
          <SongRequestListSkeleton />
        ) : requests.length === 0 ? (
          <EmptyState
            title="You haven't requested anything"
            description="Ask the DJ for a track and follow its status here."
            action={
              <AppButton
                onClick={() => navigate(routes.guest.request(eventId))}
                disabled={event?.requestStatus !== 'open'}
              >
                Request a song
              </AppButton>
            }
          />
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <SongRequestCard
                key={request.id}
                request={request}
                onOpen={() =>
                  navigate(routes.guest.requestDetails(eventId, request.id))
                }
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

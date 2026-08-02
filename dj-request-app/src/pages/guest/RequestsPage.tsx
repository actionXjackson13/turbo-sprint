import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppButton,
  EmptyState,
  PageHeader,
  SegmentedControl,
  SongRequestCard,
  SongRequestListSkeleton,
} from '../../components'
import { routes } from '../../lib/router'
import { useGuestSession } from '../../hooks/useGuestSession'
import { useEventRequests } from '../../features/requests/useEventRequests'
import {
  selectMostWanted,
  selectRecent,
} from '../../features/requests/requestLists'

type RequestView = 'wanted' | 'recent'

const ALL = 500

/**
 * Everything the room has asked for.
 *
 * The home screen shows a short preview and sends people here; browsing and
 * ordering controls belong on a screen you chose to open, not on the one you
 * land on.
 */
export function RequestsPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { event, guest } = useGuestSession()
  const { requests, myVotes, loading, pendingVotes, toggleVote } =
    useEventRequests(eventId)

  const [view, setView] = useState<RequestView>('wanted')
  const visible = useMemo(
    () =>
      view === 'wanted'
        ? selectMostWanted(requests, ALL)
        : selectRecent(requests, ALL),
    [requests, view],
  )

  const canRequest = event?.requestStatus === 'open' && !guest?.isBlocked

  return (
    <>
      <PageHeader title="Requests" showBack />

      <div className="px-4 pt-2 pb-4">
        <SegmentedControl
          label="Order requests by"
          value={view}
          onChange={setView}
          options={[
            { value: 'wanted', label: 'Most wanted' },
            { value: 'recent', label: 'Newest' },
          ]}
        />
      </div>

      <main className="flex-1 px-4 pb-4">
        {loading && requests.length === 0 ? (
          <SongRequestListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Be the first to ask for a song."
            action={
              canRequest ? (
                <AppButton
                  onClick={() => navigate(routes.guest.request(eventId))}
                >
                  Request Song
                </AppButton>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {visible.map((request) => (
              <SongRequestCard
                key={request.id}
                request={request}
                showVote
                hasVoted={myVotes.has(request.id)}
                voteLocked={
                  guest !== null &&
                  request.guestId === guest.id &&
                  myVotes.has(request.id)
                }
                votePending={pendingVotes.has(request.id)}
                onVoteToggle={() =>
                  toggleVote(request, request.guestId === guest?.id)
                }
                onOpen={() =>
                  navigate(routes.guest.requestDetails(eventId, request.id))
                }
              />
            ))}
          </div>
        )}
      </main>

      {canRequest && visible.length > 0 && (
        <div className="sticky bottom-0 bg-gradient-to-t from-ink-950 via-ink-950 to-transparent px-4 pt-6 pb-4">
          <AppButton
            size="lg"
            fullWidth
            onClick={() => navigate(routes.guest.request(eventId))}
          >
            Request Song
          </AppButton>
        </div>
      )}
    </>
  )
}

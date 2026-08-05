import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
  selectRecentlyPlayed,
} from '../../features/requests/requestLists'

type RequestView = 'wanted' | 'recent' | 'played'

const VIEWS: readonly RequestView[] = ['wanted', 'recent', 'played']

function isView(value: string | null): value is RequestView {
  return value !== null && (VIEWS as readonly string[]).includes(value)
}

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

  /**
   * Openable straight onto a section, so the home screen's "Recently played"
   * link lands where it says it will. A search parameter rather than router
   * state, so the view survives a refresh and can be linked to.
   */
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const [view, setLocalView] = useState<RequestView>(
    isView(requested) ? requested : 'wanted',
  )

  const setView = (next: RequestView) => {
    setLocalView(next)
    // Replace rather than push: flicking between sections is not a trail of
    // pages anyone wants to walk back through with the back button.
    setParams(next === 'wanted' ? {} : { view: next }, { replace: true })
  }

  const visible = useMemo(() => {
    if (view === 'wanted') return selectMostWanted(requests, ALL)
    if (view === 'played') {
      return selectRecentlyPlayed(
        requests,
        ALL,
        event?.nowPlaying?.sourceRequestId,
      )
    }
    return selectRecent(requests, ALL)
  }, [requests, view, event?.nowPlaying?.sourceRequestId])

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
            { value: 'played', label: 'Recents' },
          ]}
        />
      </div>

      <main className="flex-1 px-4 pb-4">
        {loading && requests.length === 0 ? (
          <SongRequestListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            title={view === 'played' ? 'Nothing played yet' : 'No requests yet'}
            description={
              view === 'played'
                ? 'Songs the DJ has played will show up here.'
                : 'Be the first to ask for a song.'
            }
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
                // Nothing to influence about a song that already played.
                showVote={view !== 'played'}
                showVoteCount={view === 'played'}
                timestamp={view === 'played' ? 'played' : 'requested'}
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

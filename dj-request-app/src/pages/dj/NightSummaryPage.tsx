import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlbumArt,
  AppCard,
  EmptyState,
  PageHeader,
  Section,
  SongRequestListSkeleton,
} from '../../components'
import { useEventRequests } from '../../features/requests/useEventRequests'
import {
  buildNightSummary,
  summaryHeadline,
} from '../../features/requests/nightSummary'
import type { SongRequest } from '../../types/domain'

/**
 * The record of a night.
 *
 * Everything a party produced was spread across four filter tabs and then
 * thrown away when the event ended. This is the version worth keeping: what
 * played in the order it played, what the room pushed hardest for, and what
 * never made it on — which is the only one of the three that changes what a DJ
 * does next time.
 */
export function NightSummaryPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const { requests, loading } = useEventRequests(eventId)

  const summary = useMemo(() => buildNightSummary(requests), [requests])

  if (loading && requests.length === 0) {
    return (
      <>
        <PageHeader title="The night" showBack />
        <main className="flex-1 px-4 py-5">
          <SongRequestListSkeleton count={3} />
        </main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="The night"
        subtitle={summaryHeadline(summary)}
        showBack
      />

      <main className="flex-1 space-y-7 px-4 py-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Played" value={summary.played.length} />
          <Stat label="Requested" value={summary.totalRequests} />
          <Stat label="Votes" value={summary.totalVotes} />
        </div>

        <Section title="Most wanted">
          {summary.mostWanted.length === 0 ? (
            <p className="text-sm text-fg-muted">Nobody voted tonight.</p>
          ) : (
            <ol className="space-y-2">
              {summary.mostWanted.map((request) => (
                <SummaryRow
                  key={request.id}
                  request={request}
                  trailing={`${request.voteCount} ${request.voteCount === 1 ? 'vote' : 'votes'}`}
                />
              ))}
            </ol>
          )}
        </Section>

        <Section title={`Played (${summary.played.length})`}>
          {summary.played.length === 0 ? (
            <EmptyState
              title="Nothing played yet"
              description="Songs appear here in the order you played them."
            />
          ) : (
            <ol className="space-y-2">
              {summary.played.map((request, index) => (
                <SummaryRow
                  key={request.id}
                  request={request}
                  trailing={String(index + 1)}
                />
              ))}
            </ol>
          )}
        </Section>

        {/*
          The only one of the three lists that changes what a DJ does next time.
          Set songs are left out — backdrop the night did not need is not a
          disappointment, where a request nobody played is.
        */}
        {summary.missed.length > 0 && (
          <Section title={`Never made it on (${summary.missed.length})`}>
            <ol className="space-y-2">
              {summary.missed.map((request) => (
                <SummaryRow
                  key={request.id}
                  request={request}
                  trailing={
                    request.voteCount > 0 ? `${request.voteCount}` : undefined
                  }
                />
              ))}
            </ol>
          </Section>
        )}
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <AppCard className="!p-3 text-center">
      <p className="text-hero font-bold tabular-nums text-fg">{value}</p>
      <p className="text-label uppercase text-fg-subtle">{label}</p>
    </AppCard>
  )
}

function SummaryRow({
  request,
  trailing,
}: {
  request: SongRequest
  trailing?: string
}) {
  return (
    <li>
      <AppCard className="flex items-center gap-3 !py-3">
        <AlbumArt url={request.artworkUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">
            {request.title}
          </p>
          <p className="truncate text-xs text-fg-muted">
            {request.artist} · {request.guestDisplayName}
          </p>
        </div>
        {trailing && (
          <span className="shrink-0 text-meta tabular-nums text-fg-subtle">
            {trailing}
          </span>
        )}
      </AppCard>
    </li>
  )
}

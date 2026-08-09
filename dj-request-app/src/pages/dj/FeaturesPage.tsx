import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader, SegmentedControl } from '../../components'
import { useEventRequests } from '../../features/requests/useEventRequests'
import { VotePanel } from './panels/VotePanel'
import { SetsPanel } from './panels/SetsPanel'
import { MessagePanel } from './panels/MessagePanel'
import { BlockedPanel } from './panels/BlockedPanel'

type Feature = 'vote' | 'sets' | 'message' | 'blocked'

/**
 * Everything the DJ can do that is not the queue itself.
 *
 * These had scattered as they were added: voting owned a whole nav tab, sets
 * sat off the dashboard where you could only reach them by leaving the party,
 * and messaging the room was filed under Event settings among the one-time
 * set-up. Three unrelated places for three things a DJ reaches for mid-set.
 *
 * One tab, with a selector at the top — the same shape the request lists
 * already use, so a screen never has to show everything at once and the DJ
 * only ever reads the part they came for.
 */
export function FeaturesPage() {
  const { eventId = '' } = useParams<{ eventId: string }>()
  const [feature, setFeature] = useState<Feature>('vote')

  // Loading a set changes the queue, and the queue is what the rest of the app
  // is looking at.
  const { reload } = useEventRequests(eventId)

  return (
    <>
      <PageHeader title="Features" />

      <main className="flex-1 space-y-6 px-4 py-5">
        <SegmentedControl
          label="Which feature to show"
          value={feature}
          onChange={setFeature}
          className="w-full"
          options={[
            { value: 'vote', label: 'Vote' },
            { value: 'sets', label: 'Sets' },
            { value: 'message', label: 'Message' },
            { value: 'blocked', label: 'Blocked' },
          ]}
        />

        {/* VotePanel already offers the right control in every state — "Create
            a vote" when there is none, "Start another" when one has finished,
            and nothing while one is running. */}
        {feature === 'vote' && <VotePanel />}

        {feature === 'sets' && <SetsPanel eventId={eventId} onLoaded={reload} />}

        {feature === 'message' && <MessagePanel />}

        {feature === 'blocked' && <BlockedPanel />}
      </main>
    </>
  )
}

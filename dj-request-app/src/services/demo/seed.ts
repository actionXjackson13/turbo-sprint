import type {
  EventGuest,
  Profile,
  RequestVote,
  SongRequest,
  VotingOption,
  VotingResponse,
} from '../../types/domain'
import type { DemoDb, StoredVotingRound } from './demoStore'

/**
 * Sample data for demo mode: one DJ, one live event, a handful of guests, a
 * spread of request statuses, a now-playing track, a short queue, and an
 * active voting round.
 *
 * Ids are fixed strings (rather than random UUIDs) so they are readable while
 * debugging and stable across resets.
 */

const DJ_ID = 'demo-dj-0001'
const EVENT_ID = 'demo-event-0001'
const ROUND_ID = 'demo-round-0001'

/** The identity the person trying the demo takes on as a guest by default. */
export const DEMO_GUEST_USER_ID = 'demo-guest-you'
export const DEMO_GUEST_ID = 'demo-guest-row-you'
export const DEMO_GUEST_DISPLAY_NAME = 'You'
export const DEMO_DJ_EMAIL = 'dj@demo.local'
export const DEMO_DJ_PASSWORD = 'demo1234'
export const DEMO_EVENT_CODE = 'PLAY'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export function buildSeed(): DemoDb {
  const profiles: Profile[] = [
    {
      id: DJ_ID,
      displayName: 'DJ Nova',
      createdAt: minutesAgo(600),
    },
  ]

  const guests: EventGuest[] = [
    {
      id: DEMO_GUEST_ID,
      eventId: EVENT_ID,
      guestUserId: DEMO_GUEST_USER_ID,
      displayName: DEMO_GUEST_DISPLAY_NAME,
      isBlocked: false,
      joinedAt: minutesAgo(28),
    },
    guest('demo-guest-row-1', 'demo-guest-1', 'Priya', 74),
    guest('demo-guest-row-2', 'demo-guest-2', 'Marcus', 66),
    guest('demo-guest-row-3', 'demo-guest-3', 'Ellie', 51),
    guest('demo-guest-row-4', 'demo-guest-4', 'Tomás', 44),
    guest('demo-guest-row-5', 'demo-guest-5', 'Jess', 19),
  ]

  const requests: SongRequest[] = [
    req({
      id: 'demo-req-1',
      guestId: 'demo-guest-row-1',
      guestDisplayName: 'Priya',
      title: 'Levitating',
      artist: 'Dua Lipa',
      status: 'queued',
      queuePosition: 0,
      minutes: 22,
    }),
    req({
      id: 'demo-req-2',
      guestId: 'demo-guest-row-2',
      guestDisplayName: 'Marcus',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      status: 'queued',
      queuePosition: 1,
      minutes: 19,
    }),
    req({
      id: 'demo-req-3',
      guestId: DEMO_GUEST_ID,
      guestDisplayName: DEMO_GUEST_DISPLAY_NAME,
      title: 'Dancing Queen',
      artist: 'ABBA',
      status: 'accepted',
      minutes: 16,
    }),
    req({
      id: 'demo-req-4',
      guestId: 'demo-guest-row-3',
      guestDisplayName: 'Ellie',
      title: 'Murder On The Dancefloor',
      artist: 'Sophie Ellis-Bextor',
      status: 'pending',
      minutes: 11,
    }),
    req({
      id: 'demo-req-5',
      guestId: 'demo-guest-row-4',
      guestDisplayName: 'Tomás',
      title: 'Pepas',
      artist: 'Farruko',
      status: 'pending',
      minutes: 8,
    }),
    req({
      id: 'demo-req-6',
      guestId: 'demo-guest-row-5',
      guestDisplayName: 'Jess',
      title: 'Free Bird',
      artist: 'Lynyrd Skynyrd',
      status: 'declined',
      minutes: 6,
    }),
    req({
      id: 'demo-req-7',
      guestId: 'demo-guest-row-1',
      guestDisplayName: 'Priya',
      title: 'Rasputin',
      artist: 'Boney M.',
      status: 'played',
      minutes: 40,
    }),
  ]

  // Vote rows are the source of truth; voteCount below is derived from them,
  // exactly as the Postgres trigger does.
  const requestVotes: RequestVote[] = [
    founding('demo-req-1', 'demo-guest-row-1'),
    vote('demo-req-1', 'demo-guest-row-2'),
    vote('demo-req-1', DEMO_GUEST_ID),
    vote('demo-req-1', 'demo-guest-row-3'),
    vote('demo-req-1', 'demo-guest-row-4'),

    founding('demo-req-2', 'demo-guest-row-2'),
    vote('demo-req-2', 'demo-guest-row-3'),
    vote('demo-req-2', 'demo-guest-row-5'),

    founding('demo-req-3', DEMO_GUEST_ID),
    vote('demo-req-3', 'demo-guest-row-4'),

    founding('demo-req-4', 'demo-guest-row-3'),
    vote('demo-req-4', 'demo-guest-row-1'),
    vote('demo-req-4', 'demo-guest-row-2'),
    vote('demo-req-4', 'demo-guest-row-5'),
    vote('demo-req-4', 'demo-guest-row-4'),
    vote('demo-req-4', DEMO_GUEST_ID),

    founding('demo-req-5', 'demo-guest-row-4'),

    founding('demo-req-6', 'demo-guest-row-5'),

    founding('demo-req-7', 'demo-guest-row-1'),
    vote('demo-req-7', 'demo-guest-row-2'),
  ]

  for (const r of requests) {
    r.voteCount = requestVotes.filter((v) => v.requestId === r.id).length
  }

  // No automatic end, so the demo always opens on a genuinely active round.
  const rounds: StoredVotingRound[] = [
    {
      id: ROUND_ID,
      eventId: EVENT_ID,
      status: 'active',
      durationSeconds: null,
      startsAt: minutesAgo(3),
      endsAt: null,
      winnerOptionId: null,
      endedAt: null,
      createdAt: minutesAgo(3),
    },
  ]

  const votingOptions: VotingOption[] = [
    {
      id: 'demo-opt-1',
      roundId: ROUND_ID,
      title: 'September',
      artist: 'Earth, Wind & Fire',
      displayOrder: 0,
    },
    {
      id: 'demo-opt-2',
      roundId: ROUND_ID,
      title: 'Titanium',
      artist: 'David Guetta',
      displayOrder: 1,
    },
    {
      id: 'demo-opt-3',
      roundId: ROUND_ID,
      title: 'Padam Padam',
      artist: 'Kylie Minogue',
      displayOrder: 2,
    },
  ]

  const votingResponses: VotingResponse[] = [
    response('demo-guest-row-1', 'demo-opt-1'),
    response('demo-guest-row-2', 'demo-opt-1'),
    response('demo-guest-row-3', 'demo-opt-3'),
    response('demo-guest-row-4', 'demo-opt-2'),
  ]

  return {
    profiles,
    events: [
      {
        id: EVENT_ID,
        djId: DJ_ID,
        djDisplayName: 'DJ Nova',
        name: 'Summer Rooftop Party',
        code: DEMO_EVENT_CODE,
        status: 'active',
        requestStatus: 'open',
        nowPlaying: {
          title: 'Get Lucky',
          artist: 'Daft Punk',
          sourceRequestId: null,
        },
        createdAt: minutesAgo(95),
        endedAt: null,
      },
    ],
    guests,
    requests,
    requestVotes,
    rounds,
    votingOptions,
    votingResponses,
    currentDjId: null,
  }
}

// ---- builders -------------------------------------------------------------

function guest(
  id: string,
  userId: string,
  displayName: string,
  minutes: number,
): EventGuest {
  return {
    id,
    eventId: EVENT_ID,
    guestUserId: userId,
    displayName,
    isBlocked: false,
    joinedAt: minutesAgo(minutes),
  }
}

function req(input: {
  id: string
  guestId: string
  guestDisplayName: string
  title: string
  artist: string
  status: SongRequest['status']
  queuePosition?: number
  minutes: number
}): SongRequest {
  return {
    id: input.id,
    eventId: EVENT_ID,
    guestId: input.guestId,
    guestDisplayName: input.guestDisplayName,
    title: input.title,
    artist: input.artist,
    voteCount: 0,
    status: input.status,
    queuePosition: input.queuePosition ?? null,
    sourceRoundId: null,
    createdAt: minutesAgo(input.minutes),
    updatedAt: minutesAgo(input.minutes),
  }
}

let voteSeq = 0

function vote(requestId: string, guestId: string): RequestVote {
  voteSeq += 1
  return {
    id: `demo-vote-${voteSeq}`,
    requestId,
    guestId,
    isFoundingVote: false,
    createdAt: minutesAgo(10),
  }
}

function founding(requestId: string, guestId: string): RequestVote {
  return { ...vote(requestId, guestId), isFoundingVote: true }
}

let responseSeq = 0

function response(guestId: string, optionId: string): VotingResponse {
  responseSeq += 1
  const at = minutesAgo(2)
  return {
    id: `demo-response-${responseSeq}`,
    roundId: ROUND_ID,
    optionId,
    guestId,
    createdAt: at,
    updatedAt: at,
  }
}

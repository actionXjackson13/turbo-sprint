import type {
  DjSetSong,
  EventGuest,
  Profile,
  RequestVote,
  SongRequest,
  VotingOption,
  VotingResponse,
} from '../../types/domain'
import type { DemoAccount, DemoDb, StoredVotingRound } from './demoStore'

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


/**
 * Real cover art for the sample songs, so the demo shows what the app actually
 * looks like in use rather than a column of placeholder squares. These are
 * Apple's own CDN paths, which is what they are published for; only the
 * fragment that varies is stored, since every URL shares the rest.
 */
const ARTWORK: Record<string, string> = {
  'Levitating':
    'Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg',
  'Blinding Lights':
    'Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg',
  'Dancing Queen':
    'Music115/v4/60/f8/a6/60f8a6bc-e875-238d-f2f8-f34a6034e6d2/14UMGIM07615.rgb.jpg',
  'Murder On The Dancefloor':
    'Music123/v4/c3/11/ad/c311ad1c-0b83-dd10-2092-5a06687f2eb1/06UMGIM15668.rgb.jpg',
  'Pepas':
    'Music115/v4/73/a5/bf/73a5bfac-5a57-1372-8f4e-3a83c2349346/cover_2624266.jpg',
  'Free Bird':
    'Music126/v4/57/00/f3/5700f331-2d06-7f5d-cb98-43970fd52874/14UMGIM00860.rgb.jpg',
  'Rasputin':
    'Music115/v4/b7/86/45/b786452a-a723-eaed-8170-cdc261367eb7/886443575578.jpg',
  'September':
    'Music115/v4/5c/8e/19/5c8e191d-b458-fc29-54ef-bd9367835044/886447618547.jpg',
  'Titanium':
    'Music125/v4/77/6f/57/776f57e2-017d-ed40-8f0f-1547beb65517/190296501425.jpg',
  'Padam Padam':
    'Music116/v4/ce/2f/80/ce2f8070-8267-8763-a281-4b7062872d9a/4050538925289.jpg',
  "Don't Stop Me Now":
    'Music115/v4/4d/08/2a/4d082a9e-7898-1aa1-a02f-339810058d9e/14DMGIM05632.rgb.jpg',
  'Uptown Funk':
    'Music115/v4/7e/30/c5/7e30c572-aa47-5f7b-c6fd-42d50cd2c56d/886444959797.jpg',
  'Get Lucky':
    'Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg',
}

function artworkFor(title: string): string | null {
  const path = ARTWORK[title]
  return path
    ? `https://is1-ssl.mzstatic.com/image/thumb/${path}/300x300bb.jpg`
    : null
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export function buildSeed(): DemoDb {
  const profiles: Profile[] = [
    {
      id: DJ_ID,
      displayName: 'DJ Nova',
      createdAt: minutesAgo(600),
    },
  ]

  // The sample DJ signs in with the credentials shown on the sign-in screen.
  const accounts: DemoAccount[] = [
    { email: DEMO_DJ_EMAIL, profileId: DJ_ID },
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
      playedMinutes: 9,
    }),
    // Enough history for "Recents" to look like a set rather than one row —
    // and asked for well before they were played, which is the whole reason
    // that list is ordered by when it happened.
    req({
      id: 'demo-req-8',
      guestId: 'demo-guest-row-3',
      guestDisplayName: 'Ellie',
      title: "Don't Stop Me Now",
      artist: 'Queen',
      status: 'played',
      minutes: 52,
      playedMinutes: 17,
    }),
    req({
      id: 'demo-req-9',
      guestId: 'demo-guest-row-5',
      guestDisplayName: 'Jess',
      title: 'Uptown Funk',
      artist: 'Mark Ronson',
      status: 'played',
      minutes: 61,
      playedMinutes: 26,
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
      catalogId: null,
      artworkUrl: artworkFor('September'),
      catalogUrl: null,
    },
    {
      id: 'demo-opt-2',
      roundId: ROUND_ID,
      title: 'Titanium',
      artist: 'David Guetta',
      displayOrder: 1,
      catalogId: null,
      artworkUrl: artworkFor('Titanium'),
      catalogUrl: null,
    },
    {
      id: 'demo-opt-3',
      roundId: ROUND_ID,
      title: 'Padam Padam',
      artist: 'Kylie Minogue',
      displayOrder: 2,
      catalogId: null,
      artworkUrl: artworkFor('Padam Padam'),
      catalogUrl: null,
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
    accounts,
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
          artworkUrl: artworkFor('Get Lucky'),
        },
        announcement: null,
        theme: null,
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
    // A worked example, so the feature explains itself on first open rather
    // than presenting an empty list and a "+" button.
    djSets: [
      {
        id: 'demo-set-warmup',
        djId: DJ_ID,
        name: 'Warm-up',
        createdAt: minutesAgo(2000),
        updatedAt: minutesAgo(2000),
        songs: [
          setSong('demo-set-warmup', 0, 'Get Lucky', 'Daft Punk'),
          setSong('demo-set-warmup', 1, 'Rather Be', 'Clean Bandit'),
          setSong('demo-set-warmup', 2, 'Electric Feel', 'MGMT'),
        ],
      },
    ],
    currentDjId: null,
  }
}

/** One song in a seeded set. No catalogue data — these were never searched. */
function setSong(
  setId: string,
  displayOrder: number,
  title: string,
  artist: string,
): DjSetSong {
  return {
    id: `demo-setsong-${setId}-${displayOrder}`,
    setId,
    title,
    artist,
    displayOrder,
    catalogId: null,
    artworkUrl: null,
    catalogUrl: null,
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
  /**
   * How long ago the DJ played it, when that differs from when it was asked
   * for — which it always does. "Recently played" orders by this.
   */
  playedMinutes?: number
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
    // Everything seeded was asked for, so it all belongs in the half that
    // plays next. The backdrop half only fills when a set is loaded.
    queueGroup: 'main',
    sourceRoundId: null,
    catalogId: null,
    artworkUrl: artworkFor(input.title),
    catalogUrl: null,
    createdAt: minutesAgo(input.minutes),
    updatedAt: minutesAgo(input.playedMinutes ?? input.minutes),
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

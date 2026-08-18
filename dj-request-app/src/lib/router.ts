/**
 * Centralised route paths. Keeping these here means a rename touches one file
 * and never leaves a dangling <Link> behind.
 */

export const routes = {
  welcome: '/',

  guest: {
    join: '/join',
    displayName: '/join/name',
    home: (eventId = ':eventId') => `/e/${eventId}`,
    /** Browse everything the room has asked for. */
    requests: (eventId = ':eventId') => `/e/${eventId}/requests`,
    /** Compose a new request — an action, so it stays off the bottom nav. */
    request: (eventId = ':eventId') => `/e/${eventId}/request`,
    requestDetails: (eventId = ':eventId', requestId = ':requestId') =>
      `/e/${eventId}/request/${requestId}`,
    myRequests: (eventId = ':eventId') => `/e/${eventId}/mine`,
    voting: (eventId = ':eventId') => `/e/${eventId}/vote`,
  },

  dj: {
    signIn: '/dj/sign-in',
    signUp: '/dj/sign-up',
    dashboard: '/dj',
    createEvent: '/dj/events/new',
    /**
     * The floating panel, for a DJ working from a laptop.
     *
     * Deliberately not nested under `/dj/events/:eventId` — that whole subtree
     * is one layout with a bottom navigation bar and the player in it, and the
     * panel must have neither. Its own top-level path also keeps the route
     * ranking unambiguous.
     */
    panel: (eventId = ':eventId') => `/dj/panel/${eventId}`,
    /** Song lists the DJ reuses across nights, so not scoped to an event. */
    sets: '/dj/sets',
    importPlaylist: '/dj/sets/import',
    set: (setId = ':setId') => `/dj/sets/${setId}`,
    event: (eventId = ':eventId') => `/dj/events/${eventId}`,
    share: (eventId = ':eventId') => `/dj/events/${eventId}/share`,
    requests: (eventId = ':eventId') => `/dj/events/${eventId}/requests`,
    queue: (eventId = ':eventId') => `/dj/events/${eventId}/queue`,
    /** The DJ dropping their own songs in. Reached from the queue. */
    addSong: (eventId = ':eventId') => `/dj/events/${eventId}/add`,
    /** Everyone in the room. Its own screen — a guest list is unbounded. */
    guests: (eventId = ':eventId') => `/dj/events/${eventId}/guests`,
    /** The record of a night: what played, what the room wanted, what missed. */
    summary: (eventId = ':eventId') => `/dj/events/${eventId}/summary`,
    /** Where songs play from. Set once, so it sits behind Settings. */
    music: (eventId = ':eventId') => `/dj/events/${eventId}/music`,
    theme: (eventId = ':eventId') => `/dj/events/${eventId}/theme`,
    createVote: (eventId = ':eventId') => `/dj/events/${eventId}/vote/new`,
    /**
     * Everything that is not the queue: votes, sets, messaging the room. One
     * tab with a selector, rather than three places to remember.
     */
    features: (eventId = ':eventId') => `/dj/events/${eventId}/features`,
    settings: (eventId = ':eventId') => `/dj/events/${eventId}/settings`,
  },
} as const

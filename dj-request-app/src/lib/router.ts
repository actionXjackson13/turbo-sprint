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
    event: (eventId = ':eventId') => `/dj/events/${eventId}`,
    share: (eventId = ':eventId') => `/dj/events/${eventId}/share`,
    requests: (eventId = ':eventId') => `/dj/events/${eventId}/requests`,
    queue: (eventId = ':eventId') => `/dj/events/${eventId}/queue`,
    /** Where songs play from. Set once, so it sits behind Settings. */
    music: (eventId = ':eventId') => `/dj/events/${eventId}/music`,
    createVote: (eventId = ':eventId') => `/dj/events/${eventId}/vote/new`,
    activeVote: (eventId = ':eventId') => `/dj/events/${eventId}/vote`,
    settings: (eventId = ':eventId') => `/dj/events/${eventId}/settings`,
  },
} as const

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingSkeleton } from './components'
import { ToastProvider } from './contexts/ToastProvider'
import { ServiceProvider } from './contexts/ServiceProvider'
import { DjAuthProvider } from './contexts/DjAuthProvider'
import { useDjAuth } from './hooks/useDjAuth'
import { GuestLayout } from './layouts/GuestLayout'
import { DjLayout } from './layouts/DjLayout'
import { RootLayout } from './layouts/RootLayout'
import { routes } from './lib/router'

import { WelcomePage } from './pages/guest/WelcomePage'
import { JoinEventPage } from './pages/guest/JoinEventPage'
import { DisplayNamePage } from './pages/guest/DisplayNamePage'
import { EventHomePage } from './pages/guest/EventHomePage'
import { RequestSongPage } from './pages/guest/RequestSongPage'
import { RequestDetailsPage } from './pages/guest/RequestDetailsPage'
import { MyRequestsPage } from './pages/guest/MyRequestsPage'
import { VotingRoundPage } from './pages/guest/VotingRoundPage'

import { SignInPage } from './pages/dj/SignInPage'
import { SignUpPage } from './pages/dj/SignUpPage'
import { DjDashboardPage } from './pages/dj/DjDashboardPage'
import { CreateEventPage } from './pages/dj/CreateEventPage'
import { EventControlPanelPage } from './pages/dj/EventControlPanelPage'
import { ManageRequestsPage } from './pages/dj/ManageRequestsPage'
import { QueuePage } from './pages/dj/QueuePage'
import { CreateVotingRoundPage } from './pages/dj/CreateVotingRoundPage'
import { ActiveVotingRoundPage } from './pages/dj/ActiveVotingRoundPage'
import { EventSettingsPage } from './pages/dj/EventSettingsPage'

import { NotFoundPage } from './pages/NotFoundPage'

/**
 * Gate for DJ screens that are not scoped to an event. Convenience only —
 * every DJ mutation is independently checked for ownership on the server.
 */
function RequireDj({ children }: { children: ReactNode }) {
  const { profile, loading } = useDjAuth()

  if (loading) {
    return (
      <RootLayout>
        <div className="flex-1 space-y-3 p-4 pt-safe">
          <LoadingSkeleton className="h-8 w-1/2" />
          <LoadingSkeleton className="h-32" />
        </div>
      </RootLayout>
    )
  }

  if (!profile) return <Navigate to={routes.dj.signIn} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <ServiceProvider>
        <ToastProvider>
          {/*
            HashRouter rather than BrowserRouter: the production build is
            served from a subdirectory on GitHub Pages, which has no SPA
            rewrite, so a deep link like /dj/e/<id> would 404 on reload.
            Hash routing needs no server cooperation. Guests share an event
            *code* rather than a URL, so the "#" costs nothing here.
          */}
          <HashRouter>
            <DjAuthProvider>
              <Routes>
                {/* Guest entry */}
                <Route path="/" element={<WelcomePage />} />
                <Route path="/join" element={<JoinEventPage />} />
                <Route path="/join/name" element={<DisplayNamePage />} />

                {/* In-event guest screens share the session provider and nav */}
                <Route path="/e/:eventId" element={<GuestLayout />}>
                  <Route index element={<EventHomePage />} />
                  <Route path="request" element={<RequestSongPage />} />
                  <Route
                    path="request/:requestId"
                    element={<RequestDetailsPage />}
                  />
                  <Route path="mine" element={<MyRequestsPage />} />
                  <Route path="vote" element={<VotingRoundPage />} />
                </Route>

                {/* DJ auth */}
                <Route path="/dj/sign-in" element={<SignInPage />} />
                <Route path="/dj/sign-up" element={<SignUpPage />} />

                {/* DJ, not event-scoped */}
                <Route
                  path="/dj"
                  element={
                    <RequireDj>
                      <DjDashboardPage />
                    </RequireDj>
                  }
                />
                <Route
                  path="/dj/events/new"
                  element={
                    <RequireDj>
                      <CreateEventPage />
                    </RequireDj>
                  }
                />

                {/* DJ, scoped to one event */}
                <Route path="/dj/events/:eventId" element={<DjLayout />}>
                  <Route index element={<EventControlPanelPage />} />
                  <Route path="requests" element={<ManageRequestsPage />} />
                  <Route path="queue" element={<QueuePage />} />
                  <Route path="vote" element={<ActiveVotingRoundPage />} />
                  <Route path="vote/new" element={<CreateVotingRoundPage />} />
                  <Route path="settings" element={<EventSettingsPage />} />
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </DjAuthProvider>
          </HashRouter>
        </ToastProvider>
      </ServiceProvider>
    </ErrorBoundary>
  )
}

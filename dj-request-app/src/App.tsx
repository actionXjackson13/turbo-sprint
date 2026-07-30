import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './contexts/ToastProvider'
import { ServiceProvider } from './contexts/ServiceProvider'
import { GuestLayout } from './layouts/GuestLayout'
import { WelcomePage } from './pages/guest/WelcomePage'
import { JoinEventPage } from './pages/guest/JoinEventPage'
import { DisplayNamePage } from './pages/guest/DisplayNamePage'
import { EventHomePage } from './pages/guest/EventHomePage'
import { RequestSongPage } from './pages/guest/RequestSongPage'
import { RequestDetailsPage } from './pages/guest/RequestDetailsPage'
import { MyRequestsPage } from './pages/guest/MyRequestsPage'
import { VotingRoundPage } from './pages/guest/VotingRoundPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <ErrorBoundary>
      <ServiceProvider>
        <ToastProvider>
          <BrowserRouter>
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

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </ServiceProvider>
    </ErrorBoundary>
  )
}

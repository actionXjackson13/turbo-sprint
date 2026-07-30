import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './contexts/ToastProvider'
import { RootLayout } from './layouts/RootLayout'
import { AppButton } from './components'

/**
 * Placeholder shown until the real screens land in the next phase. Routing,
 * providers and the shell are wired now so each screen can be dropped in.
 */
function Placeholder({ name }: { name: string }) {
  return (
    <RootLayout>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold text-fg">{name}</h1>
        <p className="text-sm text-fg-muted">This screen is coming next.</p>
      </div>
    </RootLayout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Placeholder name="Welcome" />} />
            <Route
              path="*"
              element={
                <RootLayout>
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                    <h1 className="text-2xl font-bold text-fg">
                      Page not found
                    </h1>
                    <AppButton onClick={() => window.location.assign('/')}>
                      Go home
                    </AppButton>
                  </div>
                </RootLayout>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}

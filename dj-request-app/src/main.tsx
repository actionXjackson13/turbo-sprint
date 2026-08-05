import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resumeParty } from './services/partySession'
import { lockViewport } from './lib/viewportLock'

/**
 * Reconnect before the first render if this tab was in a party.
 *
 * Not awaited: a party that has ended, or a DJ who has closed the app, must
 * not hold the whole UI on a blank screen while the attempt times out. The
 * screens handle the not-connected state already, and reconnecting simply
 * fills in behind them.
 */
void resumeParty()

// Before the first render: the listeners must be in place for a pinch that
// happens while the app is still loading.
lockViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

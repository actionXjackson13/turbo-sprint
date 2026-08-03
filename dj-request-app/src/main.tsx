import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resumeParty } from './services/partySession'

/**
 * Reconnect before the first render if this tab was in a party.
 *
 * Not awaited: a party that has ended, or a DJ who has closed the app, must
 * not hold the whole UI on a blank screen while the attempt times out. The
 * screens handle the not-connected state already, and reconnecting simply
 * fills in behind them.
 */
void resumeParty()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

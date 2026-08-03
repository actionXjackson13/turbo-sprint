import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoNotice } from '../../src/components/DemoNotice'
import * as env from '../../src/lib/env'

/**
 * The notice exists to stop demo mode quietly impersonating a working party.
 * Both halves matter equally: it has to appear when there is no backend, and
 * it has to vanish once there is one — a live event carrying "this device
 * only" would be worse than saying nothing at all.
 */
describe('DemoNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when the app has no backend', () => {
    vi.spyOn(env, 'isDemoMode').mockReturnValue(true)
    render(<DemoNotice>Nobody else can join this code.</DemoNotice>)

    expect(screen.getByRole('note')).toHaveTextContent(/this device only/i)
    expect(screen.getByText(/nobody else can join/i)).toBeInTheDocument()
  })

  it('renders nothing once Supabase is configured', () => {
    vi.spyOn(env, 'isDemoMode').mockReturnValue(false)
    const { container } = render(
      <DemoNotice>Nobody else can join this code.</DemoNotice>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

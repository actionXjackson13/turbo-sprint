import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AnnouncementBanner } from '../../src/components/AnnouncementBanner'

/**
 * Deciding whether a message is still showing is the screen's job, not the
 * backend's: the record keeps the last message it was given, and this watches
 * the clock so one ends on time rather than whenever the next refresh lands.
 */
function inSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AnnouncementBanner', () => {
  it('shows a live message, attributed to the DJ', () => {
    render(
      <AnnouncementBanner
        announcement={{ message: 'Last orders!', expiresAt: inSeconds(60) }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/message from the dj/i)
    expect(screen.getByText('Last orders!')).toBeInTheDocument()
  })

  it('renders nothing when there is no message', () => {
    const { container } = render(<AnnouncementBanner announcement={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a message that has already expired', () => {
    const { container } = render(
      <AnnouncementBanner
        announcement={{ message: 'Old news', expiresAt: inSeconds(-1) }}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('takes itself down when the time runs out', async () => {
    vi.useFakeTimers()
    const { container } = render(
      <AnnouncementBanner
        announcement={{ message: 'Ends soon', expiresAt: inSeconds(2) }}
      />,
    )
    expect(screen.getByText('Ends soon')).toBeInTheDocument()

    // No refetch, no prop change — only the clock moving.
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })

    expect(container).toBeEmptyDOMElement()
  })
})

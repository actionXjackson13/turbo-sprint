import { describe, expect, it } from 'vitest'
import { positionLabel } from '../../src/features/requests/useQueuePositions'

/**
 * "When is my song on?"
 *
 * The most-asked question at a party, and a guest with no answer asks again —
 * by requesting the same song a second time, or by finding the DJ. The wording
 * matters more than it looks: "1st in the queue" is technically right and reads
 * as a countdown that has not started, where "Next up" tells someone to look at
 * the dance floor.
 */
describe('how a position reads', () => {
  it('says next up rather than first', () => {
    expect(positionLabel(1)).toBe('Next up')
  })

  it('uses the ordinal a person would say', () => {
    expect(positionLabel(2)).toBe('2nd in the queue')
    expect(positionLabel(3)).toBe('3rd in the queue')
    expect(positionLabel(4)).toBe('4th in the queue')
    expect(positionLabel(21)).toBe('21st in the queue')
    expect(positionLabel(22)).toBe('22nd in the queue')
    expect(positionLabel(23)).toBe('23rd in the queue')
  })

  /** The teens break the pattern the units follow. */
  it('gets the teens right', () => {
    expect(positionLabel(11)).toBe('11th in the queue')
    expect(positionLabel(12)).toBe('12th in the queue')
    expect(positionLabel(13)).toBe('13th in the queue')
    expect(positionLabel(111)).toBe('111th in the queue')
  })
})

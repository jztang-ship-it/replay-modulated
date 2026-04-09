import { describe, it, expect } from 'vitest'
import { isChallengerTurn, CHALLENGER_INTERVAL } from '../challengerCycle'

describe('isChallengerTurn', () => {
  it('returns true when counter equals interval', () => {
    expect(isChallengerTurn(5)).toBe(true)
  })

  it('returns false for counter values below interval', () => {
    expect(isChallengerTurn(1)).toBe(false)
    expect(isChallengerTurn(4)).toBe(false)
  })

  it('CHALLENGER_INTERVAL is 5', () => {
    expect(CHALLENGER_INTERVAL).toBe(5)
  })
})

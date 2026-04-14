import { describe, it, expect } from 'vitest'
import { getProtectionConfig, selectBestCandidate } from '../lib/protection.js'

// ---------------------------------------------------------------------------
// getProtectionConfig
// ---------------------------------------------------------------------------
describe('getProtectionConfig', () => {
  it('returns null for handsPlayed 0 (FTUE — separate system)', () => {
    expect(getProtectionConfig(0)).toBeNull()
  })

  it('returns strong config for handsPlayed 1 (lower boundary)', () => {
    expect(getProtectionConfig(1)).toEqual({ level: 'strong', floor: 210, maxCandidates: 6 })
  })

  it('returns strong config for handsPlayed 4 (upper boundary)', () => {
    expect(getProtectionConfig(4)).toEqual({ level: 'strong', floor: 210, maxCandidates: 6 })
  })

  it('returns moderate config for handsPlayed 5 (lower boundary)', () => {
    expect(getProtectionConfig(5)).toEqual({ level: 'moderate', floor: 200, maxCandidates: 4 })
  })

  it('returns moderate config for handsPlayed 14 (upper boundary)', () => {
    expect(getProtectionConfig(14)).toEqual({ level: 'moderate', floor: 200, maxCandidates: 4 })
  })

  it('returns light config for handsPlayed 15 (lower boundary)', () => {
    expect(getProtectionConfig(15)).toEqual({ level: 'light', floor: 192, maxCandidates: 3 })
  })

  it('returns light config for handsPlayed 29 (upper boundary)', () => {
    expect(getProtectionConfig(29)).toEqual({ level: 'light', floor: 192, maxCandidates: 3 })
  })

  it('returns null for handsPlayed 30 (protection ends)', () => {
    expect(getProtectionConfig(30)).toBeNull()
  })

  it('returns null for handsPlayed 100 (well past protection window)', () => {
    expect(getProtectionConfig(100)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// selectBestCandidate
// ---------------------------------------------------------------------------
describe('selectBestCandidate', () => {
  it('returns null for an empty array', () => {
    expect(selectBestCandidate([], 200)).toBeNull()
  })

  it('returns a single candidate regardless of floor', () => {
    const only = { totalFp: 150, roster: ['a'] }
    expect(selectBestCandidate([only], 200)).toBe(only)
  })

  it('returns the FIRST candidate that clears the floor, not the highest', () => {
    const first  = { totalFp: 205, roster: ['a'] }
    const second = { totalFp: 220, roster: ['b'] }
    const third  = { totalFp: 215, roster: ['c'] }
    // first clears 200 — should be returned immediately without looking further
    expect(selectBestCandidate([first, second, third], 200)).toBe(first)
  })

  it('returns the highest-totalFp candidate when none clear the floor', () => {
    const low    = { totalFp: 180, roster: ['a'] }
    const mid    = { totalFp: 195, roster: ['b'] }
    const higher = { totalFp: 199, roster: ['c'] }
    // none reach floor 200 — pick the best
    expect(selectBestCandidate([low, mid, higher], 200)).toBe(higher)
  })

  it('handles a two-candidate list where only the second clears the floor', () => {
    const miss = { totalFp: 190, roster: ['a'] }
    const hit  = { totalFp: 210, roster: ['b'] }
    expect(selectBestCandidate([miss, hit], 200)).toBe(hit)
  })

  it('treats an exact floor match as clearing the floor', () => {
    const exact = { totalFp: 200, roster: ['a'] }
    const above = { totalFp: 210, roster: ['b'] }
    expect(selectBestCandidate([exact, above], 200)).toBe(exact)
  })
})

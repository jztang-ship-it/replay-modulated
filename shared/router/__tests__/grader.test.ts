import { describe, it, expect } from 'vitest'
import { computeComposite, parseGradeJson } from '../grader'

describe('computeComposite', () => {
  it('weights criteria correctly', () => {
    const scores = {
      humanness: 10,
      nbaVibe: 10,
      clarity: 10,
      accuracy: 10,
      nonRedundancy: 10,
      culturalTruth: 10,
    }
    expect(computeComposite(scores)).toBeCloseTo(10, 5)
  })

  it('weights humanness highest', () => {
    const base = { humanness: 1, nbaVibe: 10, clarity: 10, accuracy: 10, nonRedundancy: 10, culturalTruth: 10 }
    const high = { ...base, humanness: 10 }
    expect(computeComposite(high)).toBeGreaterThan(computeComposite(base))
    // Humanness weight is 0.30 — gap should be 0.30 * 9 = 2.7
    expect(computeComposite(high) - computeComposite(base)).toBeCloseTo(2.7, 1)
  })
})

describe('parseGradeJson', () => {
  it('parses clean JSON', () => {
    const raw = JSON.stringify({ humanness: 8, nba_vibe: 7, clarity: 9, accuracy: 8, non_redundancy: 7, cultural_truth: 9 })
    const result = parseGradeJson(raw)
    expect(result).not.toBeNull()
    expect(result!.humanness).toBe(8)
    expect(result!.nbaVibe).toBe(7)
  })

  it('extracts JSON from prose', () => {
    const raw = 'Here is my grade: {"humanness":7,"nba_vibe":6,"clarity":8,"accuracy":7,"non_redundancy":6,"cultural_truth":8}'
    const result = parseGradeJson(raw)
    expect(result).not.toBeNull()
    expect(result!.humanness).toBe(7)
  })

  it('returns null for unparseable input', () => {
    expect(parseGradeJson('not json at all')).toBeNull()
  })

  it('clamps scores to 1-10 range', () => {
    const raw = JSON.stringify({ humanness: 15, nba_vibe: 0, clarity: 8, accuracy: 8, non_redundancy: 7, cultural_truth: 9 })
    const result = parseGradeJson(raw)
    expect(result!.humanness).toBe(10)
    expect(result!.nbaVibe).toBe(1)
  })
})

import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  resolveTier,
  isWin,
  getStreakMultiplier,
  calculatePayout,
} from '../_lib-hand/scoring.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const noStats = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0 }
const badgeIds = (result) => result.badges.map((b) => b.id)

// ---------------------------------------------------------------------------
// calculateScore — null / missing / empty input
// ---------------------------------------------------------------------------
describe('calculateScore — null/missing/empty stats', () => {
  it('returns score 0 and empty badges for null', () => {
    const r = calculateScore(null)
    expect(r.score).toBe(0)
    expect(r.badges).toEqual([])
  })

  it('returns score 0 and empty badges for undefined', () => {
    const r = calculateScore(undefined)
    expect(r.score).toBe(0)
    expect(r.badges).toEqual([])
  })

  it('returns score 0 and empty badges for empty object', () => {
    const r = calculateScore({})
    expect(r.score).toBe(0)
    expect(r.badges).toEqual([])
  })

  it('returns score 0 and empty badges for all-zero stats', () => {
    const r = calculateScore(noStats)
    expect(r.score).toBe(0)
    expect(r.badges).toEqual([])
  })

  it('exposes rawStats on the result', () => {
    const stats = { pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, turnovers: 2 }
    const r = calculateScore(stats)
    expect(r.rawStats).toMatchObject({ pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, turnovers: 2 })
  })
})

// ---------------------------------------------------------------------------
// calculateScore — base FP weights
// ---------------------------------------------------------------------------
describe('calculateScore — base FP weights', () => {
  it('pts × 1.0', () => {
    const r = calculateScore({ ...noStats, pts: 10 })
    expect(r.score).toBe(10.0)
  })

  it('reb × 1.2 (NOT 1.25)', () => {
    // reb=5 → 5 × 1.2 = 6.0, no badges triggered
    const r = calculateScore({ ...noStats, reb: 5 })
    expect(r.score).toBe(6.0)
  })

  it('ast × 1.5', () => {
    // ast=4 → 4 × 1.5 = 6.0, no badges triggered (PURE needs ast >= 5)
    const r = calculateScore({ ...noStats, ast: 4 })
    expect(r.score).toBe(6.0)
  })

  it('stl × 2.0', () => {
    const r = calculateScore({ ...noStats, stl: 5 })
    // stl=5 fires THIEF (+4), baseFP=10 before badge. But we just want weight check:
    // baseFP = 10, badge THIEF = +4, total = 14.0
    expect(r.score).toBe(14.0)
  })

  it('blk × 2.0', () => {
    const r = calculateScore({ ...noStats, blk: 2 })
    expect(r.score).toBe(4.0)
  })

  it('turnovers × -1.0 (NOT -0.5)', () => {
    // pts=20 → baseFP=20, tov=5 → -5, baseFP=15
    // tov=5 is SLOPPY (-3), total = 15 - 3 = 12
    const r = calculateScore({ ...noStats, pts: 20, turnovers: 5 })
    expect(r.score).toBe(12.0)
  })

  it('combined stat line with known result', () => {
    // pts=20(20) + reb=5(6) + ast=4(6) + stl=1(2) + blk=1(2) + tov=2(-2) = 34
    const r = calculateScore({ pts: 20, reb: 5, ast: 4, stl: 1, blk: 1, turnovers: 2 })
    expect(r.score).toBe(34.0)
  })
})

// ---------------------------------------------------------------------------
// calculateScore — FP floor (clamped to 0 BEFORE badges)
// ---------------------------------------------------------------------------
describe('calculateScore — FP floor', () => {
  it('clamps negative baseFP to 0 before badges', () => {
    // pts=1(1) + tov=10(-10) → baseFP = -9 → clamped to 0
    // tov=10 → TURNOVER_MACHINE (-6), total = 0 - 6 = -6 … but wait,
    // the spec says clamp to 0 BEFORE badges, and total can still go negative.
    const r = calculateScore({ ...noStats, pts: 1, turnovers: 10 })
    expect(r.score).toBe(-6.0)
    expect(badgeIds(r)).toContain('TURNOVER_MACHINE')
  })

  it('all-zero stat line produces score 0 with no badges', () => {
    const r = calculateScore(noStats)
    expect(r.score).toBe(0)
    expect(r.badges).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SCORING badges (pts category — highest only)
// ---------------------------------------------------------------------------
describe('Badges — SCORING category', () => {
  it('GOD_MODE fires at exactly pts=50', () => {
    const r = calculateScore({ ...noStats, pts: 50 })
    expect(badgeIds(r)).toContain('GOD_MODE')
    const badge = r.badges.find((b) => b.id === 'GOD_MODE')
    expect(badge).toMatchObject({ id: 'GOD_MODE', icon: '⚡', label: 'God Mode', fp: 10 })
  })

  it('FIRE fires at exactly pts=40', () => {
    const r = calculateScore({ ...noStats, pts: 40 })
    expect(badgeIds(r)).toContain('FIRE')
    expect(badgeIds(r)).not.toContain('GOD_MODE')
  })

  it('FIRE fires at pts=49', () => {
    const r = calculateScore({ ...noStats, pts: 49 })
    expect(badgeIds(r)).toContain('FIRE')
  })

  it('BUCKET fires at exactly pts=30', () => {
    const r = calculateScore({ ...noStats, pts: 30 })
    expect(badgeIds(r)).toContain('BUCKET')
    expect(badgeIds(r)).not.toContain('FIRE')
  })

  it('no scoring badge below pts=30', () => {
    const r = calculateScore({ ...noStats, pts: 29 })
    expect(badgeIds(r)).not.toContain('BUCKET')
    expect(badgeIds(r)).not.toContain('FIRE')
    expect(badgeIds(r)).not.toContain('GOD_MODE')
  })

  it('category dedup: GOD_MODE suppresses FIRE and BUCKET', () => {
    const r = calculateScore({ ...noStats, pts: 50 })
    expect(badgeIds(r)).not.toContain('FIRE')
    expect(badgeIds(r)).not.toContain('BUCKET')
  })

  it('GOD_MODE badge has correct fp (+10)', () => {
    const r = calculateScore({ ...noStats, pts: 50 })
    const badge = r.badges.find((b) => b.id === 'GOD_MODE')
    expect(badge.fp).toBe(10)
  })

  it('FIRE badge has correct fp (+5)', () => {
    const r = calculateScore({ ...noStats, pts: 40 })
    const badge = r.badges.find((b) => b.id === 'FIRE')
    expect(badge.fp).toBe(5)
  })

  it('BUCKET badge has correct fp (+2)', () => {
    const r = calculateScore({ ...noStats, pts: 30 })
    const badge = r.badges.find((b) => b.id === 'BUCKET')
    expect(badge.fp).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// REBOUNDS badges
// ---------------------------------------------------------------------------
describe('Badges — REBOUNDS category', () => {
  it('BEAST fires at reb=15', () => {
    const r = calculateScore({ ...noStats, reb: 15 })
    expect(badgeIds(r)).toContain('BEAST')
    expect(r.badges.find((b) => b.id === 'BEAST')).toMatchObject({ icon: '🦍', fp: 5 })
  })

  it('GLASS fires at reb=10', () => {
    const r = calculateScore({ ...noStats, reb: 10 })
    expect(badgeIds(r)).toContain('GLASS')
    expect(badgeIds(r)).not.toContain('BEAST')
    expect(r.badges.find((b) => b.id === 'GLASS')).toMatchObject({ icon: '🧲', fp: 3 })
  })

  it('BEAST suppresses GLASS', () => {
    const r = calculateScore({ ...noStats, reb: 20 })
    expect(badgeIds(r)).not.toContain('GLASS')
  })

  it('no rebound badge below reb=10', () => {
    const r = calculateScore({ ...noStats, reb: 9 })
    expect(badgeIds(r)).not.toContain('GLASS')
    expect(badgeIds(r)).not.toContain('BEAST')
  })
})

// ---------------------------------------------------------------------------
// ASSISTS badges
// ---------------------------------------------------------------------------
describe('Badges — ASSISTS category', () => {
  it('WIZARD fires at ast=15', () => {
    const r = calculateScore({ ...noStats, ast: 15 })
    expect(badgeIds(r)).toContain('WIZARD')
    expect(r.badges.find((b) => b.id === 'WIZARD')).toMatchObject({ icon: '🪄', fp: 5 })
  })

  it('DIME fires at ast=10', () => {
    const r = calculateScore({ ...noStats, ast: 10 })
    expect(badgeIds(r)).toContain('DIME')
    expect(badgeIds(r)).not.toContain('WIZARD')
    expect(r.badges.find((b) => b.id === 'DIME')).toMatchObject({ icon: '🧠', fp: 3 })
  })

  it('WIZARD suppresses DIME', () => {
    const r = calculateScore({ ...noStats, ast: 20 })
    expect(badgeIds(r)).not.toContain('DIME')
  })

  it('no assists badge below ast=10', () => {
    const r = calculateScore({ ...noStats, ast: 9 })
    expect(badgeIds(r)).not.toContain('DIME')
    expect(badgeIds(r)).not.toContain('WIZARD')
  })
})

// ---------------------------------------------------------------------------
// STEALS badges
// ---------------------------------------------------------------------------
describe('Badges — STEALS category', () => {
  it('THIEF fires at stl=5', () => {
    const r = calculateScore({ ...noStats, stl: 5 })
    expect(badgeIds(r)).toContain('THIEF')
    expect(r.badges.find((b) => b.id === 'THIEF')).toMatchObject({ icon: '🧤', fp: 4 })
  })

  it('PICKPOCKET fires at stl=3 (new badge)', () => {
    const r = calculateScore({ ...noStats, stl: 3 })
    expect(badgeIds(r)).toContain('PICKPOCKET')
    expect(badgeIds(r)).not.toContain('THIEF')
    expect(r.badges.find((b) => b.id === 'PICKPOCKET')).toMatchObject({ icon: '👀', fp: 2 })
  })

  it('THIEF suppresses PICKPOCKET', () => {
    const r = calculateScore({ ...noStats, stl: 5 })
    expect(badgeIds(r)).not.toContain('PICKPOCKET')
  })

  it('no steals badge at stl=2', () => {
    const r = calculateScore({ ...noStats, stl: 2 })
    expect(badgeIds(r)).not.toContain('PICKPOCKET')
    expect(badgeIds(r)).not.toContain('THIEF')
  })
})

// ---------------------------------------------------------------------------
// BLOCKS badges
// ---------------------------------------------------------------------------
describe('Badges — BLOCKS category', () => {
  it('SWAT fires at blk=5', () => {
    const r = calculateScore({ ...noStats, blk: 5 })
    expect(badgeIds(r)).toContain('SWAT')
    expect(r.badges.find((b) => b.id === 'SWAT')).toMatchObject({ icon: '🚫', fp: 4 })
  })

  it('REJECTION fires at blk=3 (new badge)', () => {
    const r = calculateScore({ ...noStats, blk: 3 })
    expect(badgeIds(r)).toContain('REJECTION')
    expect(badgeIds(r)).not.toContain('SWAT')
    expect(r.badges.find((b) => b.id === 'REJECTION')).toMatchObject({ icon: '🛡️', fp: 2 })
  })

  it('SWAT suppresses REJECTION', () => {
    const r = calculateScore({ ...noStats, blk: 5 })
    expect(badgeIds(r)).not.toContain('REJECTION')
  })

  it('no blocks badge at blk=2', () => {
    const r = calculateScore({ ...noStats, blk: 2 })
    expect(badgeIds(r)).not.toContain('REJECTION')
    expect(badgeIds(r)).not.toContain('SWAT')
  })
})

// ---------------------------------------------------------------------------
// EFFICIENCY badges
// ---------------------------------------------------------------------------
describe('Badges — EFFICIENCY category', () => {
  it('MAESTRO fires at ast=10, tov=0', () => {
    const r = calculateScore({ ...noStats, ast: 10, turnovers: 0 })
    expect(badgeIds(r)).toContain('MAESTRO')
    expect(r.badges.find((b) => b.id === 'MAESTRO')).toMatchObject({ icon: '🎼', fp: 8 })
  })

  it('MAESTRO suppresses PURE', () => {
    const r = calculateScore({ ...noStats, ast: 10, turnovers: 0 })
    expect(badgeIds(r)).not.toContain('PURE')
  })

  it('PURE fires at ast=5, tov=0', () => {
    const r = calculateScore({ ...noStats, ast: 5, turnovers: 0 })
    expect(badgeIds(r)).toContain('PURE')
    expect(r.badges.find((b) => b.id === 'PURE')).toMatchObject({ icon: '🎯', fp: 3 })
  })

  it('no efficiency badge when tov > 0', () => {
    const r = calculateScore({ ...noStats, ast: 15, turnovers: 1 })
    expect(badgeIds(r)).not.toContain('MAESTRO')
    expect(badgeIds(r)).not.toContain('PURE')
  })

  it('no efficiency badge when ast < 5', () => {
    const r = calculateScore({ ...noStats, ast: 4, turnovers: 0 })
    expect(badgeIds(r)).not.toContain('PURE')
  })
})

// ---------------------------------------------------------------------------
// NEGATIVE badges
// ---------------------------------------------------------------------------
describe('Badges — NEGATIVE category', () => {
  it('TURNOVER_MACHINE fires at tov=6', () => {
    const r = calculateScore({ ...noStats, pts: 30, turnovers: 6 })
    expect(badgeIds(r)).toContain('TURNOVER_MACHINE')
    expect(r.badges.find((b) => b.id === 'TURNOVER_MACHINE')).toMatchObject({ icon: '🤦', fp: -6 })
  })

  it('SLOPPY fires at tov=4', () => {
    const r = calculateScore({ ...noStats, pts: 30, turnovers: 4 })
    expect(badgeIds(r)).toContain('SLOPPY')
    expect(badgeIds(r)).not.toContain('TURNOVER_MACHINE')
    expect(r.badges.find((b) => b.id === 'SLOPPY')).toMatchObject({ icon: '💦', fp: -3 })
  })

  it('TURNOVER_MACHINE suppresses SLOPPY', () => {
    const r = calculateScore({ ...noStats, pts: 30, turnovers: 6 })
    expect(badgeIds(r)).not.toContain('SLOPPY')
  })

  it('no negative badge below tov=4', () => {
    const r = calculateScore({ ...noStats, turnovers: 3 })
    expect(badgeIds(r)).not.toContain('SLOPPY')
    expect(badgeIds(r)).not.toContain('TURNOVER_MACHINE')
  })

  it('SLOPPY + FIRE stack (different categories)', () => {
    // pts=40 → FIRE, tov=4 → SLOPPY
    const r = calculateScore({ ...noStats, pts: 40, turnovers: 4 })
    expect(badgeIds(r)).toContain('FIRE')
    expect(badgeIds(r)).toContain('SLOPPY')
  })

  it('SLOPPY + FIRE produce correct combined score', () => {
    // baseFP: pts=40(40) + tov=4(-4) = 36; badges: FIRE(+5) + SLOPPY(-3) = +2; total = 38.0
    const r = calculateScore({ ...noStats, pts: 40, turnovers: 4 })
    expect(r.score).toBe(38.0)
  })
})

// ---------------------------------------------------------------------------
// MILESTONE badges
// ---------------------------------------------------------------------------
describe('Badges — MILESTONE category', () => {
  it('DOUBLE_DBL fires when 2+ stats >= 10', () => {
    const r = calculateScore({ ...noStats, pts: 10, reb: 10 })
    expect(badgeIds(r)).toContain('DOUBLE_DBL')
    expect(r.badges.find((b) => b.id === 'DOUBLE_DBL')).toMatchObject({ icon: '✌️', fp: 2 })
  })

  it('TRIPLE_DBL fires when 3+ stats >= 10', () => {
    const r = calculateScore({ ...noStats, pts: 10, reb: 10, ast: 10 })
    expect(badgeIds(r)).toContain('TRIPLE_DBL')
    expect(badgeIds(r)).not.toContain('DOUBLE_DBL')
    expect(r.badges.find((b) => b.id === 'TRIPLE_DBL')).toMatchObject({ icon: '👑', fp: 8 })
  })

  it('QUAD_DBL fires when 4+ stats >= 10 with +30 FP (not +50)', () => {
    const r = calculateScore({ ...noStats, pts: 10, reb: 10, ast: 10, stl: 10 })
    expect(badgeIds(r)).toContain('QUAD_DBL')
    expect(r.badges.find((b) => b.id === 'QUAD_DBL')).toMatchObject({ icon: '🦕', fp: 30 })
    expect(badgeIds(r)).not.toContain('TRIPLE_DBL')
    expect(badgeIds(r)).not.toContain('DOUBLE_DBL')
  })

  it('5X5 fires when all 5 stats >= 5 (independent)', () => {
    const r = calculateScore({ pts: 5, reb: 5, ast: 5, stl: 5, blk: 5, turnovers: 0 })
    expect(badgeIds(r)).toContain('5X5')
    expect(r.badges.find((b) => b.id === '5X5')).toMatchObject({ icon: '🖐️', fp: 15 })
  })

  it('5X5 stacks with TRIPLE_DBL', () => {
    // pts=10,reb=10,ast=10,stl=5,blk=5 → TRIPLE_DBL + 5X5
    const r = calculateScore({ pts: 10, reb: 10, ast: 10, stl: 5, blk: 5, turnovers: 0 })
    expect(badgeIds(r)).toContain('TRIPLE_DBL')
    expect(badgeIds(r)).toContain('5X5')
  })

  it('5X5 does NOT fire when one stat < 5', () => {
    const r = calculateScore({ pts: 4, reb: 5, ast: 5, stl: 5, blk: 5, turnovers: 0 })
    expect(badgeIds(r)).not.toContain('5X5')
  })

  it('QUAD_DBL counts blk among the 5 eligible stats', () => {
    const r = calculateScore({ pts: 10, reb: 10, ast: 10, stl: 10, blk: 10, turnovers: 0 })
    expect(badgeIds(r)).toContain('QUAD_DBL')
  })
})

// ---------------------------------------------------------------------------
// String stat values
// ---------------------------------------------------------------------------
describe('calculateScore — string stat values', () => {
  it('handles string numbers gracefully', () => {
    const r = calculateScore({ pts: '20', reb: '5', ast: '4', stl: '1', blk: '1', turnovers: '2' })
    // Same as numeric: pts=20(20)+reb=5(6)+ast=4(6)+stl=1(2)+blk=1(2)+tov=2(-2) = 34
    expect(r.score).toBe(34.0)
  })

  it('treats non-numeric strings as 0', () => {
    const r = calculateScore({ pts: 'abc', reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0 })
    expect(r.score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// resolveTier
// ---------------------------------------------------------------------------
describe('resolveTier', () => {
  it('BUST for score < 190', () => {
    expect(resolveTier(189)).toMatchObject({ tier: 'BUST', multiplier: 0, color: '#64748b' })
  })

  it('BUST at 0', () => {
    expect(resolveTier(0)).toMatchObject({ tier: 'BUST', multiplier: 0 })
  })

  it('ROOKIE at exactly 190', () => {
    expect(resolveTier(190)).toMatchObject({ tier: 'ROOKIE', multiplier: 0.5, color: '#3b82f6' })
  })

  it('ROOKIE at 204', () => {
    expect(resolveTier(204)).toMatchObject({ tier: 'ROOKIE', multiplier: 0.5 })
  })

  it('STARTER at exactly 205', () => {
    expect(resolveTier(205)).toMatchObject({ tier: 'STARTER', multiplier: 1.5, color: '#22c55e' })
  })

  it('ALL_STAR at exactly 225', () => {
    expect(resolveTier(225)).toMatchObject({ tier: 'ALL_STAR', multiplier: 3, color: '#f97316' })
  })

  it('MVP at exactly 235', () => {
    expect(resolveTier(235)).toMatchObject({ tier: 'MVP', multiplier: 8, color: '#eab308' })
  })

  it('LEGEND at exactly 255', () => {
    expect(resolveTier(255)).toMatchObject({ tier: 'LEGEND', multiplier: 50, color: '#a855f7' })
  })

  it('LEGEND above 255', () => {
    expect(resolveTier(300)).toMatchObject({ tier: 'LEGEND', multiplier: 50 })
  })
})

// ---------------------------------------------------------------------------
// isWin
// ---------------------------------------------------------------------------
describe('isWin', () => {
  it('BUST is not a win', () => expect(isWin('BUST')).toBe(false))
  it('ROOKIE is NOT a win', () => expect(isWin('ROOKIE')).toBe(false))
  it('STARTER is a win', () => expect(isWin('STARTER')).toBe(true))
  it('ALL_STAR is a win', () => expect(isWin('ALL_STAR')).toBe(true))
  it('MVP is a win', () => expect(isWin('MVP')).toBe(true))
  it('LEGEND is a win', () => expect(isWin('LEGEND')).toBe(true))
})

// ---------------------------------------------------------------------------
// getStreakMultiplier
// ---------------------------------------------------------------------------
describe('getStreakMultiplier', () => {
  it('streak 0 → 1.0', () => expect(getStreakMultiplier(0)).toBe(1.0))
  it('streak 1 → 1.0', () => expect(getStreakMultiplier(1)).toBe(1.0))
  it('streak 2 → 1.0', () => expect(getStreakMultiplier(2)).toBe(1.0))
  it('streak 3 → 1.2', () => expect(getStreakMultiplier(3)).toBe(1.2))
  it('streak 4 → 1.2', () => expect(getStreakMultiplier(4)).toBe(1.2))
  it('streak 5 → 1.5', () => expect(getStreakMultiplier(5)).toBe(1.5))
  it('streak 9 → 1.5', () => expect(getStreakMultiplier(9)).toBe(1.5))
  it('streak 10 → 2.0', () => expect(getStreakMultiplier(10)).toBe(2.0))
  it('streak 100 → 2.0', () => expect(getStreakMultiplier(100)).toBe(2.0))
})

// ---------------------------------------------------------------------------
// calculatePayout
// ---------------------------------------------------------------------------
describe('calculatePayout', () => {
  it('multiplier × betAmount', () => {
    expect(calculatePayout(3, 100)).toBe(300)
    expect(calculatePayout(8, 50)).toBe(400)
    expect(calculatePayout(0.5, 200)).toBe(100)
    expect(calculatePayout(0, 999)).toBe(0)
    expect(calculatePayout(50, 10)).toBe(500)
  })
})

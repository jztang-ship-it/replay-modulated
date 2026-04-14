import { describe, it, expect, vi } from 'vitest'

// Mock supabaseServer so the Supabase client is never instantiated in tests
vi.mock('../lib/supabaseServer.ts', () => ({
  supabaseAdmin: {},
}))

import { generateRoster, redrawRoster } from '../lib/dealer.ts'

// ---------------------------------------------------------------------------
// Seeded RNG (LCG — deterministic)
// ---------------------------------------------------------------------------
function makeRng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ---------------------------------------------------------------------------
// Mock pool — 20 players with realistic costs
// ---------------------------------------------------------------------------
const mockPool = [
  { id: 'p1',  name: 'Star A',  team: 'LAL', position: 'SF', cost: 73, tier: 'RED' },
  { id: 'p2',  name: 'Star B',  team: 'BOS', position: 'PF', cost: 66, tier: 'ORANGE' },
  { id: 'p3',  name: 'Star C',  team: 'MIL', position: 'C',  cost: 58, tier: 'ORANGE' },
  { id: 'p4',  name: 'Mid A',   team: 'PHI', position: 'PG', cost: 50, tier: 'PURPLE' },
  { id: 'p5',  name: 'Mid B',   team: 'MIA', position: 'SG', cost: 46, tier: 'PURPLE' },
  { id: 'p6',  name: 'Mid C',   team: 'GSW', position: 'SF', cost: 44, tier: 'PURPLE' },
  { id: 'p7',  name: 'Role A',  team: 'DEN', position: 'PF', cost: 35, tier: 'BLUE' },
  { id: 'p8',  name: 'Role B',  team: 'OKC', position: 'C',  cost: 33, tier: 'BLUE' },
  { id: 'p9',  name: 'Role C',  team: 'NYK', position: 'PG', cost: 30, tier: 'BLUE' },
  { id: 'p10', name: 'Bench A', team: 'CLE', position: 'SG', cost: 25, tier: 'GREEN' },
  { id: 'p11', name: 'Bench B', team: 'IND', position: 'SF', cost: 23, tier: 'GREEN' },
  { id: 'p12', name: 'Deep A',  team: 'MIN', position: 'PG', cost: 20, tier: 'WHITE' },
  { id: 'p13', name: 'Deep B',  team: 'SAC', position: 'SG', cost: 18, tier: 'WHITE' },
  { id: 'p14', name: 'Deep C',  team: 'TOR', position: 'PF', cost: 16, tier: 'WHITE' },
  { id: 'p15', name: 'Deep D',  team: 'HOU', position: 'C',  cost: 14, tier: 'WHITE' },
  { id: 'p16', name: 'Deep E',  team: 'WAS', position: 'SF', cost: 12, tier: 'WHITE' },
  { id: 'p17', name: 'Deep F',  team: 'DET', position: 'PG', cost: 10, tier: 'WHITE' },
  { id: 'p18', name: 'Star D',  team: 'DAL', position: 'PG', cost: 62, tier: 'ORANGE' },
  { id: 'p19', name: 'Mid D',   team: 'ATL', position: 'SG', cost: 40, tier: 'BLUE' },
  { id: 'p20', name: 'Bench C', team: 'CHI', position: 'PF', cost: 28, tier: 'GREEN' },
]

// ---------------------------------------------------------------------------
// generateRoster
// ---------------------------------------------------------------------------
describe('generateRoster', () => {
  it('returns a 6-player roster', () => {
    const rnd = makeRng(42)
    const roster = generateRoster(mockPool, rnd)
    expect(roster).not.toBeNull()
    expect(roster).toHaveLength(6)
    roster.forEach(p => expect(p).not.toBeNull())
  })

  it('returns null if pool has < 6 players', () => {
    const rnd = makeRng(42)
    const result = generateRoster(mockPool.slice(0, 5), rnd)
    expect(result).toBeNull()
  })

  it('respects salary cap ($250) over 50 iterations', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = makeRng(seed)
      const roster = generateRoster(mockPool, rnd)
      expect(roster).not.toBeNull()
      const total = roster.reduce((s, p) => s + p.cost, 0)
      expect(total).toBeLessThanOrEqual(250)
    }
  })

  it('meets min spend ($244) most of the time over 50 iterations', () => {
    let underCount = 0
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = makeRng(seed)
      const roster = generateRoster(mockPool, rnd)
      expect(roster).not.toBeNull()
      const total = roster.reduce((s, p) => s + p.cost, 0)
      if (total < 244) underCount++
    }
    // Allow some outliers due to constrained 20-player pool
    expect(underCount).toBeLessThanOrEqual(10)
  })

  it('has no duplicate players over 50 iterations', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = makeRng(seed)
      const roster = generateRoster(mockPool, rnd)
      expect(roster).not.toBeNull()
      const ids = roster.map(p => p.id)
      expect(new Set(ids).size).toBe(6)
    }
  })

  it('has at least one ORANGE+ anchor over 50 iterations', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = makeRng(seed)
      const roster = generateRoster(mockPool, rnd)
      expect(roster).not.toBeNull()
      const hasAnchor = roster.some(
        p => p.tier === 'RED' || p.tier === 'ORANGE'
      )
      expect(hasAnchor).toBe(true)
    }
  })

  it('returns players with correct shape', () => {
    const rnd = makeRng(99)
    const roster = generateRoster(mockPool, rnd)
    expect(roster).not.toBeNull()
    for (const p of roster) {
      expect(p).toHaveProperty('id')
      expect(p).toHaveProperty('name')
      expect(p).toHaveProperty('team')
      expect(p).toHaveProperty('position')
      expect(p).toHaveProperty('cost')
      expect(p).toHaveProperty('tier')
    }
  })
})

// ---------------------------------------------------------------------------
// redrawRoster
// ---------------------------------------------------------------------------
describe('redrawRoster', () => {
  it('preserves held players in exact slots', () => {
    const rnd1 = makeRng(42)
    const original = generateRoster(mockPool, rnd1)
    expect(original).not.toBeNull()

    const heldIndices = [0, 2, 4]
    const rnd2 = makeRng(123)
    const redrawn = redrawRoster(original, heldIndices, mockPool, rnd2)

    for (const i of heldIndices) {
      expect(redrawn[i].id).toBe(original[i].id)
      expect(redrawn[i].cost).toBe(original[i].cost)
    }
  })

  it('replaces non-held slots with new players', () => {
    const rnd1 = makeRng(42)
    const original = generateRoster(mockPool, rnd1)
    expect(original).not.toBeNull()

    const heldIndices = [0, 2, 4]
    const nonHeldIndices = [1, 3, 5]
    const rnd2 = makeRng(777)
    const redrawn = redrawRoster(original, heldIndices, mockPool, rnd2)

    // At least one non-held slot should have a different player
    const changed = nonHeldIndices.some(i => redrawn[i].id !== original[i].id)
    expect(changed).toBe(true)
  })

  it('respects salary cap after redraw', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd1 = makeRng(seed)
      const original = generateRoster(mockPool, rnd1)
      expect(original).not.toBeNull()

      const heldIndices = [0, 3]
      const rnd2 = makeRng(seed + 1000)
      const redrawn = redrawRoster(original, heldIndices, mockPool, rnd2)
      const total = redrawn.reduce((s, p) => s + p.cost, 0)
      expect(total).toBeLessThanOrEqual(250)
    }
  })

  it('has no duplicate players after redraw', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd1 = makeRng(seed)
      const original = generateRoster(mockPool, rnd1)
      expect(original).not.toBeNull()

      const heldIndices = [1, 4]
      const rnd2 = makeRng(seed + 2000)
      const redrawn = redrawRoster(original, heldIndices, mockPool, rnd2)
      const ids = redrawn.map(p => p.id)
      expect(new Set(ids).size).toBe(6)
    }
  })

  it('returns 6 players', () => {
    const rnd1 = makeRng(42)
    const original = generateRoster(mockPool, rnd1)
    const rnd2 = makeRng(99)
    const redrawn = redrawRoster(original, [0], mockPool, rnd2)
    expect(redrawn).toHaveLength(6)
  })
})

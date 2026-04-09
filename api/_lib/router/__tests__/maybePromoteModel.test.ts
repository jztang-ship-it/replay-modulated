import { describe, it, expect, vi } from 'vitest'
import { maybePromoteModel, primaryModelKey, primaryByTierKey } from '../kvStore.js'
import type { GradeScore, RouterModel, PayoutTier } from '../types.js'

function mockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, val: string) => { store.set(key, val) }),
    pipeline: vi.fn(),
    incr: vi.fn(),
    lrange: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
    hincrby: vi.fn(),
    hincrbyfloat: vi.fn(),
  }
}

function makeGrade(composite: number): GradeScore {
  return {
    humanness: composite,
    nbaVibe: composite,
    clarity: composite,
    accuracy: composite,
    nonRedundancy: composite,
    culturalTruth: composite,
    composite,
  }
}

describe('maybePromoteModel', () => {
  const challenger: RouterModel = 'llama-3.3-70b-versatile'
  const current: RouterModel = 'claude-haiku-4-5'
  const ns = 'test'

  it('promotes when gap is 0.3 (within 0.5 threshold)', async () => {
    const kv = mockKV()
    const result = await maybePromoteModel(kv as any, ns, challenger, current, makeGrade(8.0), makeGrade(8.3))
    expect(result).toBe(true)
  })

  it('does NOT promote when gap is 1.0 (>0.5)', async () => {
    const kv = mockKV()
    const result = await maybePromoteModel(kv as any, ns, challenger, current, makeGrade(8.0), makeGrade(9.0))
    expect(result).toBe(false)
  })

  it('promotes when challenger is better (gap is negative)', async () => {
    const kv = mockKV()
    const result = await maybePromoteModel(kv as any, ns, challenger, current, makeGrade(9.0), makeGrade(8.0))
    expect(result).toBe(true)
  })

  it('promotes when gap is exactly 0.5 (at threshold)', async () => {
    const kv = mockKV()
    const result = await maybePromoteModel(kv as any, ns, challenger, current, makeGrade(7.5), makeGrade(8.0))
    expect(result).toBe(true)
  })

  it('does NOT promote when gap is 0.6 (just over threshold)', async () => {
    const kv = mockKV()
    const result = await maybePromoteModel(kv as any, ns, challenger, current, makeGrade(7.4), makeGrade(8.0))
    expect(result).toBe(false)
  })

  it('writes to tier-specific KV key when tier is provided', async () => {
    const kv = mockKV()
    const tier: PayoutTier = 'MVP'
    await maybePromoteModel(kv as any, ns, challenger, current, makeGrade(8.0), makeGrade(8.0), tier)
    expect(kv.set).toHaveBeenCalled()
    const setCall = kv.set.mock.calls[0]
    expect(setCall[0]).toBe(primaryByTierKey(ns))
    const written = JSON.parse(setCall[1] as string)
    expect(written[tier]).toBe(challenger)
  })

  it('returns false with null KV (no crash)', async () => {
    const result = await maybePromoteModel(null, ns, challenger, current, makeGrade(8.0), makeGrade(8.0))
    expect(result).toBe(false)
  })
})

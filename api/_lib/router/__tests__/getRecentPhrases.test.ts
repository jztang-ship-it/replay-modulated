import { describe, it, expect, vi } from 'vitest'
import { getRecentPhrases, STATIC_BANNED_PHRASES } from '../kvStore.js'

function mockKV(lrangeResult?: string[] | Error) {
  return {
    get: vi.fn(),
    set: vi.fn(),
    lrange: vi.fn(async () => {
      if (lrangeResult instanceof Error) throw lrangeResult
      return lrangeResult ?? []
    }),
    pipeline: vi.fn(),
    incr: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
  }
}

describe('getRecentPhrases', () => {
  const ns = 'test'

  it('returns STATIC_BANNED_PHRASES when KV is null', async () => {
    const result = await getRecentPhrases(null, ns)
    expect(result).toEqual(STATIC_BANNED_PHRASES)
    // Should be a copy, not the same reference
    expect(result).not.toBe(STATIC_BANNED_PHRASES)
  })

  it('returns STATIC_BANNED_PHRASES only when KV returns empty list', async () => {
    const kv = mockKV([])
    const result = await getRecentPhrases(kv as any, ns)
    expect(result).toEqual(STATIC_BANNED_PHRASES)
  })

  it('merges KV phrases after static phrases', async () => {
    const kv = mockKV(['custom phrase one', 'custom phrase two'])
    const result = await getRecentPhrases(kv as any, ns)
    expect(result.slice(0, STATIC_BANNED_PHRASES.length)).toEqual(STATIC_BANNED_PHRASES)
    expect(result).toContain('custom phrase one')
    expect(result).toContain('custom phrase two')
    expect(result.length).toBe(STATIC_BANNED_PHRASES.length + 2)
  })

  it('deduplicates KV phrases that are already in static', async () => {
    const kv = mockKV([STATIC_BANNED_PHRASES[0]])
    const result = await getRecentPhrases(kv as any, ns)
    expect(result.length).toBe(STATIC_BANNED_PHRASES.length)
    // No duplicate
    expect(result.filter(p => p === STATIC_BANNED_PHRASES[0]).length).toBe(1)
  })

  it('returns STATIC_BANNED_PHRASES when KV throws', async () => {
    const kv = mockKV(new Error('connection refused'))
    const result = await getRecentPhrases(kv as any, ns)
    expect(result).toEqual(STATIC_BANNED_PHRASES)
  })
})

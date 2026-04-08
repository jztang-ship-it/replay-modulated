import { describe, it, expect } from 'vitest'
import { modelScoreKey, tierScoreKey, recentPhrasesKey, primaryModelKey, challengerCounterKey } from '../kvStore'

describe('KV key builders', () => {
  it('modelScoreKey returns namespaced key', () => {
    expect(modelScoreKey('replaymod', 'claude-haiku-4-5'))
      .toBe('replaymod:model:claude-haiku-4-5:scores')
  })

  it('tierScoreKey returns namespaced tier key', () => {
    expect(tierScoreKey('replaymod', 'llama-3.3-70b-versatile', 'BUST'))
      .toBe('replaymod:model:llama-3.3-70b-versatile:tier:BUST:scores')
  })

  it('recentPhrasesKey returns namespaced key', () => {
    expect(recentPhrasesKey('replaymod')).toBe('replaymod:recent:phrases')
  })

  it('primaryModelKey returns namespaced key', () => {
    expect(primaryModelKey('replaymod')).toBe('replaymod:routing:primary')
  })

  it('challengerCounterKey returns namespaced key', () => {
    expect(challengerCounterKey('replaymod')).toBe('replaymod:challenger:counter')
  })
})

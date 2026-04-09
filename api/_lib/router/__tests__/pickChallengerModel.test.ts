import { describe, it, expect } from 'vitest'
import { pickChallengerModel } from '../challengerCycle.js'

describe('pickChallengerModel', () => {
  it('returns llama-3.3-70b-versatile for even counter (0)', () => {
    expect(pickChallengerModel(0)).toBe('llama-3.3-70b-versatile')
  })

  it('returns llama-3.3-70b-versatile for even counter (2)', () => {
    expect(pickChallengerModel(2)).toBe('llama-3.3-70b-versatile')
  })

  it('returns llama-3.3-70b-versatile for even counter (4)', () => {
    expect(pickChallengerModel(4)).toBe('llama-3.3-70b-versatile')
  })

  it('returns deepseek-chat for odd counter (1)', () => {
    expect(pickChallengerModel(1)).toBe('deepseek-chat')
  })

  it('returns deepseek-chat for odd counter (3)', () => {
    expect(pickChallengerModel(3)).toBe('deepseek-chat')
  })

  it('returns deepseek-chat for odd counter (5)', () => {
    expect(pickChallengerModel(5)).toBe('deepseek-chat')
  })

  it('alternates between both models across a range', () => {
    const models = new Set<string>()
    for (let i = 0; i < 10; i++) {
      models.add(pickChallengerModel(i))
    }
    expect(models.has('llama-3.3-70b-versatile')).toBe(true)
    expect(models.has('deepseek-chat')).toBe(true)
    expect(models.size).toBe(2)
  })
})

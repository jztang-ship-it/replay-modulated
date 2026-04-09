/** How many hands between challenger turns */
export const CHALLENGER_INTERVAL = 5

/**
 * Returns true when the current counter value means D should generate
 * instead of judge. The KV counter is already incremented before this
 * is called (see kvStore.getAndIncrementChallengerCounter).
 */
export function isChallengerTurn(counter: number): boolean {
  return counter >= CHALLENGER_INTERVAL
}

/**
 * Returns which free model should be the challenger on this turn.
 * Alternates between Groq and DeepSeek so both get data.
 */
export function pickChallengerModel(counter: number): 'llama-3.3-70b-versatile' | 'deepseek-chat' {
  return counter % 2 === 0 ? 'llama-3.3-70b-versatile' : 'deepseek-chat'
}

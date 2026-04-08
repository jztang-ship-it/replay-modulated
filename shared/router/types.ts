/** Which model handled a request */
export type RouterModel =
  | 'claude-haiku-4-5'
  | 'llama-3.3-70b-versatile'   // Groq
  | 'deepseek-chat'              // DeepSeek

/** Payout tier — mirrors basketball tier thresholds */
export type PayoutTier = 'BUST' | 'ROOKIE' | 'STARTER' | 'ALL_STAR' | 'MVP' | 'GOAT'

/** Per-criterion score (1-10) plus weighted composite */
export interface GradeScore {
  humanness: number       // 0.30 weight
  nbaVibe: number         // 0.20 weight
  clarity: number         // 0.15 weight
  accuracy: number        // 0.15 weight
  nonRedundancy: number   // 0.10 weight
  culturalTruth: number   // 0.10 weight
  composite: number       // weighted average
}

/** Full grading result for one generated line */
export interface GradeResult {
  model: RouterModel
  commentary: string
  grade: GradeScore
  tier?: PayoutTier
}

/** What llmRouter returns to the caller */
export interface RouterResult {
  commentary: string
  tone: string
  modelUsed: RouterModel
  source: 'router' | 'fallback'
}

/** Config passed by each project to llmRouter */
export interface RouterConfig {
  /** Upstash KV namespace prefix, e.g. "replaymod" */
  namespace: string
  /** Default primary model if KV has no routing decision yet */
  defaultPrimary: RouterModel
  /** Groq API key */
  groqApiKey?: string
  /** DeepSeek API key */
  deepseekApiKey?: string
  /** Anthropic API key */
  anthropicApiKey: string
  /** Max ms to wait for a cross-checker to replace primary result (default 1500) */
  patchWindowMs?: number
}

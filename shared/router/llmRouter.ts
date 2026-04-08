import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { gradeCommentary } from './grader'
import {
  makeKV, getRecentPhrases, recordRecentPhrase, recordModelScore,
  getPrimaryModel, getAndIncrementChallengerCounter,
} from './kvStore'
import { isChallengerTurn, pickChallengerModel } from './challengerCycle'
import type { RouterConfig, RouterResult, RouterModel, PayoutTier } from './types'

// ── Model callers ─────────────────────────────────────────────────────────────

async function callClaude(system: string, user: string, apiKey: string): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 320,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const text = (msg.content[0] as any)?.text?.trim() ?? ''
    return extractCommentary(text)
  } catch (err) {
    console.error('[ROUTER] Claude error:', err instanceof Error ? err.message : err)
    return null
  }
}

async function callGroq(system: string, user: string, apiKey: string): Promise<string | null> {
  try {
    const client = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey })
    const result = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 320,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })
    const text = result.choices[0]?.message?.content?.trim() ?? ''
    return extractCommentary(text)
  } catch (err) {
    console.error('[ROUTER] Groq error:', err instanceof Error ? err.message : err)
    return null
  }
}

async function callDeepSeek(system: string, user: string, apiKey: string): Promise<string | null> {
  try {
    const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: apiKey })
    const result = await client.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 320,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })
    const text = result.choices[0]?.message?.content?.trim() ?? ''
    return extractCommentary(text)
  } catch (err) {
    console.error('[ROUTER] DeepSeek error:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Extract commentary string from JSON or raw text */
function extractCommentary(text: string): string | null {
  if (!text) return null
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      if (typeof obj.commentary === 'string' && obj.commentary.trim()) {
        return obj.commentary.trim()
      }
    }
  } catch { /* fall through to raw text */ }
  // If no JSON, use raw text only if it doesn't look like debugging output
  if (!text.includes('```') && !text.includes('"commentary"')) return text
  return null
}

function extractTone(text: string): string {
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      if (typeof obj.tone === 'string') return obj.tone
    }
  } catch { /* ignore */ }
  return 'observational'
}

// ── Roster summary for grader context ────────────────────────────────────────

function buildRosterSummary(userPrompt: string): string {
  const lines = userPrompt.split('\n').filter(l => l.match(/^\d+\./))
  return lines.slice(0, 3).join('; ') || 'roster not available'
}

// ── Main router ───────────────────────────────────────────────────────────────

export async function routeCommentary(
  system: string,
  user: string,
  tier: PayoutTier,
  config: RouterConfig,
): Promise<RouterResult> {
  const kv = makeKV()
  const ns = config.namespace

  // 1. Get current primary model from KV (or default)
  const primaryModel = await getPrimaryModel(kv, ns, config.defaultPrimary, tier)

  // 2. Get challenger counter — determine if this is a challenger round
  const counter = await getAndIncrementChallengerCounter(kv, ns)
  const isChallenger = isChallengerTurn(counter)
  const challengerModel = isChallenger ? pickChallengerModel(counter) : null

  // 3. Get banned phrases for anti-redundancy
  const bannedPhrases = await getRecentPhrases(kv, ns)

  // 4. Call primary model — this is the result we ship immediately
  let primaryCommentary: string | null = null

  if (primaryModel === 'claude-haiku-4-5') {
    primaryCommentary = await callClaude(system, user, config.anthropicApiKey)
  } else if (primaryModel === 'llama-3.3-70b-versatile' && config.groqApiKey) {
    primaryCommentary = await callGroq(system, user, config.groqApiKey)
  } else if (primaryModel === 'deepseek-chat' && config.deepseekApiKey) {
    primaryCommentary = await callDeepSeek(system, user, config.deepseekApiKey)
  }

  // Fallback to Claude if primary failed
  if (!primaryCommentary) {
    primaryCommentary = await callClaude(system, user, config.anthropicApiKey)
  }

  const result: RouterResult = {
    commentary: primaryCommentary ?? "Off night. The numbers don't lie.",
    tone: 'observational',
    modelUsed: primaryModel,
    source: 'router',
  }

  // 5. Fire background cross-checking and grading (non-blocking)
  const rosterSummary = buildRosterSummary(user)
  runBackgroundChecks({
    system, user, tier, config, kv, ns,
    primaryCommentary: result.commentary,
    primaryModel,
    isChallenger,
    challengerModel,
    bannedPhrases,
    rosterSummary,
  }).catch(err => console.error('[ROUTER] Background error:', err))

  return result
}

// ── Background work (fire-and-forget) ────────────────────────────────────────

async function runBackgroundChecks(opts: {
  system: string
  user: string
  tier: PayoutTier
  config: RouterConfig
  kv: ReturnType<typeof makeKV>
  ns: string
  primaryCommentary: string
  primaryModel: RouterModel
  isChallenger: boolean
  challengerModel: RouterModel | null
  bannedPhrases: string[]
  rosterSummary: string
}) {
  const { system, user, tier, config, kv, ns, primaryCommentary, primaryModel, isChallenger, challengerModel, bannedPhrases, rosterSummary } = opts

  if (!config.groqApiKey) return

  // Grade primary
  const primaryGrade = await gradeCommentary(primaryCommentary, tier, rosterSummary, bannedPhrases, config.groqApiKey)
  if (primaryGrade) {
    await recordModelScore(kv, ns, primaryModel, primaryGrade, tier)
    // Record notable phrases to KV for future anti-redundancy
    const notablePhrases = ["couldn't carry", 'the rest of the roster', 'went nuclear', 'showed up', 'disappeared']
    for (const phrase of notablePhrases) {
      if (primaryCommentary.toLowerCase().includes(phrase)) {
        await recordRecentPhrase(kv, ns, phrase)
      }
    }
  }

  // On challenger rounds: get the challenger model to generate, grade it
  if (isChallenger && challengerModel) {
    let challengerCommentary: string | null = null
    if (challengerModel === 'llama-3.3-70b-versatile' && config.groqApiKey) {
      challengerCommentary = await callGroq(system, user, config.groqApiKey)
    } else if (challengerModel === 'deepseek-chat' && config.deepseekApiKey) {
      challengerCommentary = await callDeepSeek(system, user, config.deepseekApiKey)
    }

    if (challengerCommentary) {
      const challengerGrade = await gradeCommentary(challengerCommentary, tier, rosterSummary, bannedPhrases, config.groqApiKey)
      if (challengerGrade) {
        await recordModelScore(kv, ns, challengerModel, challengerGrade, tier)
        console.log(`[ROUTER] Challenger ${challengerModel} scored ${challengerGrade.composite.toFixed(2)} vs primary ${primaryGrade?.composite.toFixed(2) ?? 'n/a'}`)
      }
    }
  } else if (config.groqApiKey && config.deepseekApiKey) {
    // Normal round: run B and C as cross-checkers (grade only, don't surface)
    const [bResult, cResult] = await Promise.allSettled([
      config.groqApiKey ? callGroq(system, user, config.groqApiKey) : Promise.resolve(null),
      config.deepseekApiKey ? callDeepSeek(system, user, config.deepseekApiKey) : Promise.resolve(null),
    ])

    const bCommentary = bResult.status === 'fulfilled' ? bResult.value : null
    const cCommentary = cResult.status === 'fulfilled' ? cResult.value : null

    if (bCommentary) {
      const bg = await gradeCommentary(bCommentary, tier, rosterSummary, bannedPhrases, config.groqApiKey)
      if (bg) await recordModelScore(kv, ns, 'llama-3.3-70b-versatile', bg, tier)
    }
    if (cCommentary && config.deepseekApiKey) {
      const cg = await gradeCommentary(cCommentary, tier, rosterSummary, bannedPhrases, config.groqApiKey)
      if (cg) await recordModelScore(kv, ns, 'deepseek-chat', cg, tier)
    }
  }
}

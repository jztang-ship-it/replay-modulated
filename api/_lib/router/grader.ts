import OpenAI from 'openai'
import type { GradeScore, RouterModel } from './types.js'

// ── Weights (must sum to 1.0) ─────────────────────────────────────────────────
const WEIGHTS = {
  humanness:     0.30,
  nbaVibe:       0.20,
  clarity:       0.15,
  accuracy:      0.15,
  nonRedundancy: 0.10,
  culturalTruth: 0.10,
} as const

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export function computeComposite(scores: Omit<GradeScore, 'composite'>): number {
  return (
    scores.humanness     * WEIGHTS.humanness +
    scores.nbaVibe       * WEIGHTS.nbaVibe +
    scores.clarity       * WEIGHTS.clarity +
    scores.accuracy      * WEIGHTS.accuracy +
    scores.nonRedundancy * WEIGHTS.nonRedundancy +
    scores.culturalTruth * WEIGHTS.culturalTruth
  )
}

function clamp(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)))
}

export function parseGradeJson(raw: string): Omit<GradeScore, 'composite'> | null {
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>

    const humanness     = clamp(Number(obj.humanness     ?? obj.human_ness ?? 5))
    const nbaVibe       = clamp(Number(obj.nba_vibe      ?? obj.nbaVibe    ?? 5))
    const clarity       = clamp(Number(obj.clarity                         ?? 5))
    const accuracy      = clamp(Number(obj.accuracy                        ?? 5))
    const nonRedundancy = clamp(Number(obj.non_redundancy ?? obj.nonRedundancy ?? 5))
    const culturalTruth = clamp(Number(obj.cultural_truth ?? obj.culturalTruth ?? 5))

    return { humanness, nbaVibe, clarity, accuracy, nonRedundancy, culturalTruth }
  } catch {
    return null
  }
}

// ── Grading prompt ────────────────────────────────────────────────────────────

function buildGradePrompt(
  commentary: string,
  tier: string,
  rosterSummary: string,
  bannedPhrases: string[],
): string {
  const banned = bannedPhrases.length > 0 ? bannedPhrases.slice(0, 10).join(', ') : 'none'
  return `Grade this fantasy basketball commentary line on 6 criteria, each scored 1-10.

COMMENTARY TO GRADE:
"${commentary}"

CONTEXT:
- Result tier: ${tier}
- Roster summary: ${rosterSummary}
- Recently overused phrases (check for these): ${banned}

SCORING CRITERIA:
1. humanness (1-10): Does it sound like a real person talking, not a template? 10 = completely natural, 1 = robotic/formulaic.
2. nba_vibe (1-10): Does it have NBA personality and opinion (Shaq/Chuck energy)? 10 = strong voice, 1 = generic recap.
3. clarity (1-10): Is it one clear story with no contradiction? Win framing on wins, loss framing on losses only? 10 = perfectly clear, 1 = contradicts itself.
4. accuracy (1-10): Does it reflect what actually happened to this roster? 10 = perfectly accurate, 1 = describes wrong players/outcomes.
5. non_redundancy (1-10): Does it avoid the recently overused phrases listed above? Uses fresh language? 10 = completely fresh, 1 = multiple banned phrases.
6. cultural_truth (1-10): Are all nicknames and player facts accurate to the real player? 10 = all facts correct, 1 = wrong nicknames or invented facts.

Return ONLY valid JSON, nothing else:
{"humanness":N,"nba_vibe":N,"clarity":N,"accuracy":N,"non_redundancy":N,"cultural_truth":N}`
}

// ── Main grading function ─────────────────────────────────────────────────────

export async function gradeCommentary(
  commentary: string,
  tier: string,
  rosterSummary: string,
  bannedPhrases: string[],
  groqApiKey: string,
): Promise<GradeScore | null> {
  try {
    const client = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: groqApiKey,
    })

    const result = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile' as RouterModel,
      max_tokens: 100,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a strict commentary quality grader. Return ONLY valid JSON.' },
        { role: 'user', content: buildGradePrompt(commentary, tier, rosterSummary, bannedPhrases) },
      ],
    })

    const raw = result.choices[0]?.message?.content ?? ''
    const parsed = parseGradeJson(raw)
    if (!parsed) return null

    return { ...parsed, composite: computeComposite(parsed) }
  } catch (err) {
    console.error('[GRADER] Error:', err instanceof Error ? err.message : err)
    return null
  }
}

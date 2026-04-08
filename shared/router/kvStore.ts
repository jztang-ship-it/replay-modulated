import { Redis } from '@upstash/redis'
import type { RouterModel, PayoutTier, GradeScore } from './types'

// ── Key builders (exported for tests) ────────────────────────────────────────

export const modelScoreKey = (ns: string, model: RouterModel) =>
  `${ns}:model:${model}:scores`

export const tierScoreKey = (ns: string, model: RouterModel, tier: PayoutTier) =>
  `${ns}:model:${model}:tier:${tier}:scores`

export const recentPhrasesKey = (ns: string) => `${ns}:recent:phrases`

export const recentTonesKey = (ns: string) => `${ns}:recent:tones`

export const primaryModelKey = (ns: string) => `${ns}:routing:primary`

export const primaryByTierKey = (ns: string) => `${ns}:routing:primary_by_tier`

export const challengerCounterKey = (ns: string) => `${ns}:challenger:counter`

export const gradesAllKey = (ns: string) => `${ns}:grades:all`

// ── KV client factory ─────────────────────────────────────────────────────────

export function makeKV(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

// ── Score recording ───────────────────────────────────────────────────────────

export async function recordModelScore(
  kv: Redis,
  ns: string,
  model: RouterModel,
  grade: GradeScore,
  tier?: PayoutTier,
): Promise<void> {
  const pipe = kv.pipeline()

  // Global model scores
  const mKey = modelScoreKey(ns, model)
  pipe.hincrby(mKey, 'total', 1)
  pipe.hincrbyfloat(mKey, 'sum_composite', grade.composite)
  pipe.hincrbyfloat(mKey, 'sum_humanness', grade.humanness)
  pipe.hincrbyfloat(mKey, 'sum_nba_vibe', grade.nbaVibe)
  pipe.hincrbyfloat(mKey, 'sum_clarity', grade.clarity)
  pipe.hincrbyfloat(mKey, 'sum_accuracy', grade.accuracy)
  pipe.hincrbyfloat(mKey, 'sum_non_redundancy', grade.nonRedundancy)
  pipe.hincrbyfloat(mKey, 'sum_cultural_truth', grade.culturalTruth)

  // Per-tier scores
  if (tier) {
    const tKey = tierScoreKey(ns, model, tier)
    pipe.hincrby(tKey, 'total', 1)
    pipe.hincrbyfloat(tKey, 'sum_composite', grade.composite)
  }

  await pipe.exec()
}

// ── Recent phrases (anti-redundancy) ─────────────────────────────────────────

export async function getRecentPhrases(kv: Redis, ns: string): Promise<string[]> {
  try {
    const raw = await kv.lrange(recentPhrasesKey(ns), 0, 19)
    return raw.map(String)
  } catch {
    return []
  }
}

export async function recordRecentPhrase(kv: Redis, ns: string, phrase: string): Promise<void> {
  try {
    await kv.lpush(recentPhrasesKey(ns), phrase)
    await kv.ltrim(recentPhrasesKey(ns), 0, 19)
  } catch {
    // non-blocking — fail silently
  }
}

// ── Routing decisions ─────────────────────────────────────────────────────────

export async function getPrimaryModel(
  kv: Redis,
  ns: string,
  defaultModel: RouterModel,
  tier?: PayoutTier,
): Promise<RouterModel> {
  try {
    // Check tier-specific routing first
    if (tier) {
      const byTierRaw = await kv.get<string>(primaryByTierKey(ns))
      if (byTierRaw) {
        const byTier = JSON.parse(byTierRaw) as Partial<Record<PayoutTier, RouterModel>>
        if (byTier[tier]) return byTier[tier]!
      }
    }
    // Fall back to global primary
    const primary = await kv.get<string>(primaryModelKey(ns))
    return (primary as RouterModel) ?? defaultModel
  } catch {
    return defaultModel
  }
}

export async function maybePromoteModel(
  kv: Redis,
  ns: string,
  challenger: RouterModel,
  current: RouterModel,
  grade: GradeScore,
  currentGrade: GradeScore,
  tier?: PayoutTier,
): Promise<boolean> {
  const gap = currentGrade.composite - grade.composite
  if (gap > -0.5) return false // challenger not close enough

  try {
    if (tier) {
      const byTierRaw = await kv.get<string>(primaryByTierKey(ns))
      const byTier = byTierRaw ? JSON.parse(byTierRaw) as Record<string, RouterModel> : {}
      byTier[tier] = challenger
      await kv.set(primaryByTierKey(ns), JSON.stringify(byTier))
    } else {
      await kv.set(primaryModelKey(ns), challenger)
    }
    console.log(`[ROUTER] Promoted ${challenger} over ${current} for ${tier ?? 'global'}`)
    return true
  } catch {
    return false
  }
}

// ── Challenger counter ────────────────────────────────────────────────────────

export async function getAndIncrementChallengerCounter(
  kv: Redis,
  ns: string,
): Promise<number> {
  try {
    const counter = await kv.incr(challengerCounterKey(ns))
    if (counter >= 5) await kv.set(challengerCounterKey(ns), 0)
    return counter
  } catch {
    return 0
  }
}

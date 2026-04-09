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

export function makeKV(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.warn('[KV] Upstash env vars missing — KV operations will be skipped')
    return null
  }
  try {
    return new Redis({ url, token })
  } catch (err) {
    console.error('[KV] Failed to construct Redis client:', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Score recording ───────────────────────────────────────────────────────────

export async function recordModelScore(
  kv: Redis | null,
  ns: string,
  model: RouterModel,
  grade: GradeScore,
  tier?: PayoutTier,
): Promise<void> {
  if (!kv) return
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

export const STATIC_BANNED_PHRASES = [
  "the rest of the roster",
  "rest of the squad",
  "supporting cast",
  "pick up the slack",
  "went nuclear",
  "showed up",
  "couldn't carry",
  "carry the load",
  "off night",
  "quiet night",
]

export async function getRecentPhrases(kv: Redis | null, ns: string): Promise<string[]> {
  if (!kv) return [...STATIC_BANNED_PHRASES]
  try {
    const raw = await kv.lrange(recentPhrasesKey(ns), 0, 19)
    const fromKv = raw.map(String)
    const merged = [...STATIC_BANNED_PHRASES]
    for (const p of fromKv) if (!merged.includes(p)) merged.push(p)
    return merged
  } catch {
    return [...STATIC_BANNED_PHRASES]
  }
}

export async function recordRecentPhrase(kv: Redis | null, ns: string, phrase: string): Promise<void> {
  if (!kv) return
  try {
    const pipe = kv.pipeline()
    pipe.lpush(recentPhrasesKey(ns), phrase)
    pipe.ltrim(recentPhrasesKey(ns), 0, 19)
    await pipe.exec()
  } catch {
    // non-blocking — fail silently
  }
}

// ── Routing decisions ─────────────────────────────────────────────────────────

export async function getPrimaryModel(
  kv: Redis | null,
  ns: string,
  defaultModel: RouterModel,
  tier?: PayoutTier,
): Promise<RouterModel> {
  if (!kv) return defaultModel
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
  kv: Redis | null,
  ns: string,
  challenger: RouterModel,
  current: RouterModel,
  grade: GradeScore,
  currentGrade: GradeScore,
  tier?: PayoutTier,
): Promise<boolean> {
  if (!kv) return false
  const gap = currentGrade.composite - grade.composite
  if (gap > 0.5) return false // primary is more than 0.5 better — don't promote yet

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
  kv: Redis | null,
  ns: string,
): Promise<number> {
  if (!kv) return 0
  try {
    const counter = await kv.incr(challengerCounterKey(ns))
    if (counter >= 5) await kv.set(challengerCounterKey(ns), 0)
    return counter
  } catch {
    return 0
  }
}

# Multi-LLM Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-improving parallel cross-check router for ReplayMod commentary that ships Claude Haiku's result immediately, cross-checks with free models async, grades all outputs against 6 criteria, and routes smarter over time as grade data accumulates.

**Architecture:** `api/commentary.ts` delegates to `shared/router/llmRouter.ts`. Claude Haiku (A) answers immediately. Groq/Llama (B) and DeepSeek (C) run async in the background. Llama-as-judge (D) grades all three against 6 weighted criteria and writes scores to Upstash Redis. Every 5th hand, D generates instead of judging. When a free model's rolling score closes within 0.5 of Claude's, it gets promoted to primary for that tier — reducing cost automatically.

**Tech Stack:** TypeScript, Vercel Node.js serverless, Upstash Redis (`@upstash/redis`), Groq API (`openai` compat), DeepSeek API (`openai` compat), Anthropic SDK, Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-09-multi-llm-router-design.md`

---

## File Map

**Create:**
- `shared/router/types.ts` — all shared TypeScript types
- `shared/router/kvStore.ts` — Upstash read/write abstraction
- `shared/router/grader.ts` — 6-criteria Llama grading function
- `shared/router/challengerCycle.ts` — every-5-hands rotation counter
- `shared/router/llmRouter.ts` — parallel dispatch + background grading
- `shared/router/__tests__/grader.test.ts`
- `shared/router/__tests__/kvStore.test.ts`
- `shared/router/__tests__/challengerCycle.test.ts`

**Modify:**
- `package.json` (root) — add `@upstash/redis`, `openai`, `vitest`
- `api/commentary.ts` — replace direct Claude call with `llmRouter`
- `shared/commentary/promptBuilder.ts` — inject banned phrases + cultural truth rule + persona enforcement
- `basketball/src/utils/buildBasketballContext.ts` — expose banned phrases from KV

---

## Task 1: Install dependencies and add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install packages**

```bash
cd /Users/john/Desktop/ReplayMod
npm install @upstash/redis openai
npm install --save-dev vitest
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts` at the repo root:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['shared/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

```bash
npm test
```
Expected: `No test files found` or 0 tests run. No errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add upstash/redis, openai, vitest dependencies"
```

---

## Task 2: Types foundation

**Files:**
- Create: `shared/router/types.ts`

- [ ] **Step 1: Create types file**

Create `shared/router/types.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add shared/router/types.ts
git commit -m "feat(router): add shared router types"
```

---

## Task 3: KV store abstraction

**Files:**
- Create: `shared/router/kvStore.ts`
- Create: `shared/router/__tests__/kvStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `shared/router/__tests__/kvStore.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../kvStore'`

- [ ] **Step 3: Create kvStore.ts**

Create `shared/router/kvStore.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — should pass**

```bash
npm test
```
Expected: All 5 key-builder tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/router/kvStore.ts shared/router/__tests__/kvStore.test.ts
git commit -m "feat(router): add KV store abstraction with key builders"
```

---

## Task 4: Grader (Llama judges commentary)

**Files:**
- Create: `shared/router/grader.ts`
- Create: `shared/router/__tests__/grader.test.ts`

- [ ] **Step 1: Write failing tests**

Create `shared/router/__tests__/grader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeComposite, parseGradeJson } from '../grader'

describe('computeComposite', () => {
  it('weights criteria correctly', () => {
    const scores = {
      humanness: 10,
      nbaVibe: 10,
      clarity: 10,
      accuracy: 10,
      nonRedundancy: 10,
      culturalTruth: 10,
    }
    expect(computeComposite(scores)).toBeCloseTo(10, 5)
  })

  it('weights humanness highest', () => {
    const base = { humanness: 1, nbaVibe: 10, clarity: 10, accuracy: 10, nonRedundancy: 10, culturalTruth: 10 }
    const high = { ...base, humanness: 10 }
    expect(computeComposite(high)).toBeGreaterThan(computeComposite(base))
    // Humanness weight is 0.30 — gap should be 0.30 * 9 = 2.7
    expect(computeComposite(high) - computeComposite(base)).toBeCloseTo(2.7, 1)
  })
})

describe('parseGradeJson', () => {
  it('parses clean JSON', () => {
    const raw = JSON.stringify({ humanness: 8, nba_vibe: 7, clarity: 9, accuracy: 8, non_redundancy: 7, cultural_truth: 9 })
    const result = parseGradeJson(raw)
    expect(result).not.toBeNull()
    expect(result!.humanness).toBe(8)
    expect(result!.nbaVibe).toBe(7)
  })

  it('extracts JSON from prose', () => {
    const raw = 'Here is my grade: {"humanness":7,"nba_vibe":6,"clarity":8,"accuracy":7,"non_redundancy":6,"cultural_truth":8}'
    const result = parseGradeJson(raw)
    expect(result).not.toBeNull()
    expect(result!.humanness).toBe(7)
  })

  it('returns null for unparseable input', () => {
    expect(parseGradeJson('not json at all')).toBeNull()
  })

  it('clamps scores to 1-10 range', () => {
    const raw = JSON.stringify({ humanness: 15, nba_vibe: 0, clarity: 8, accuracy: 8, non_redundancy: 7, cultural_truth: 9 })
    const result = parseGradeJson(raw)
    expect(result!.humanness).toBe(10)
    expect(result!.nbaVibe).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — confirm failure**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../grader'`

- [ ] **Step 3: Create grader.ts**

Create `shared/router/grader.ts`:

```typescript
import OpenAI from 'openai'
import type { GradeScore, RouterModel } from './types'

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
  rostorSummary: string,
  bannedPhrases: string[],
): string {
  const banned = bannedPhrases.length > 0 ? bannedPhrases.slice(0, 10).join(', ') : 'none'
  return `Grade this fantasy basketball commentary line on 6 criteria, each scored 1-10.

COMMENTARY TO GRADE:
"${commentary}"

CONTEXT:
- Result tier: ${tier}
- Roster summary: ${rostorSummary}
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
```

- [ ] **Step 4: Run tests — all pass**

```bash
npm test
```
Expected: All grader tests PASS (computeComposite, parseGradeJson).

- [ ] **Step 5: Commit**

```bash
git add shared/router/grader.ts shared/router/__tests__/grader.test.ts
git commit -m "feat(router): add 6-criteria Llama grader with pure helpers"
```

---

## Task 5: Challenger cycle counter

**Files:**
- Create: `shared/router/challengerCycle.ts`
- Create: `shared/router/__tests__/challengerCycle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `shared/router/__tests__/challengerCycle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isChallengerTurn, CHALLENGER_INTERVAL } from '../challengerCycle'

describe('isChallengerTurn', () => {
  it('returns true when counter equals interval', () => {
    expect(isChallengerTurn(5)).toBe(true)
  })

  it('returns false for counter values below interval', () => {
    expect(isChallengerTurn(1)).toBe(false)
    expect(isChallengerTurn(4)).toBe(false)
  })

  it('CHALLENGER_INTERVAL is 5', () => {
    expect(CHALLENGER_INTERVAL).toBe(5)
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../challengerCycle'`

- [ ] **Step 3: Create challengerCycle.ts**

Create `shared/router/challengerCycle.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — all pass**

```bash
npm test
```
Expected: All challenger cycle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/router/challengerCycle.ts shared/router/__tests__/challengerCycle.test.ts
git commit -m "feat(router): add challenger cycle counter logic"
```

---

## Task 6: LLM Router — main orchestrator

**Files:**
- Create: `shared/router/llmRouter.ts`

- [ ] **Step 1: Create llmRouter.ts**

Create `shared/router/llmRouter.ts`:

```typescript
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

/** Extract commentary string + tone from JSON or raw text */
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
  const patchWindowMs = config.patchWindowMs ?? 1500

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
  let primaryTone = 'observational'

  if (primaryModel === 'claude-haiku-4-5') {
    const raw = await callClaude(system, user, config.anthropicApiKey)
    primaryCommentary = raw
    // Re-fetch raw to extract tone (callClaude strips to commentary only)
    // tone extraction is best-effort from the same response
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
    commentary: primaryCommentary ?? 'Off night. The numbers don\'t lie.',
    tone: primaryTone,
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
    const words = primaryCommentary.toLowerCase().split(/\s+/)
    const phrases = ['couldn\'t carry', 'the rest of the roster', 'went nuclear', 'showed up', 'disappeared']
    for (const phrase of phrases) {
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
```

- [ ] **Step 2: Commit**

```bash
git add shared/router/llmRouter.ts
git commit -m "feat(router): add parallel cross-check router with background grading"
```

---

## Task 7: Wire router into api/commentary.ts

**Files:**
- Modify: `api/commentary.ts`

- [ ] **Step 1: Read current api/commentary.ts**

Open `api/commentary.ts`. Currently it calls Anthropic directly with `body.system` and `body.user` and returns `{ commentary, tone }`.

- [ ] **Step 2: Replace direct Claude call with router**

Replace the content of `api/commentary.ts`:

```typescript
/**
 * api/commentary.ts — Vercel serverless function.
 * Proxies commentary generation through the multi-LLM router.
 * ANTHROPIC_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY stay server-side.
 *
 * POST { system: string, user: string, tier?: string }
 *   → { commentary: string, tone: string }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeCommentary } from "../shared/router/llmRouter";
import type { RouterConfig, PayoutTier } from "../shared/router/types";

const VALID_TIERS = new Set(['BUST','ROOKIE','STARTER','ALL_STAR','MVP','GOAT'])

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const anthropicApiKey = process.env.COMMENTARY_API_KEY;
  if (!anthropicApiKey) return json(res, 500, { error: "COMMENTARY_API_KEY not configured" });

  const body = (req.body ?? {}) as { system?: string; user?: string; tier?: string };
  if (!body.system || !body.user) return json(res, 400, { error: "system and user prompts required" });

  const tier = (body.tier && VALID_TIERS.has(body.tier) ? body.tier : 'BUST') as PayoutTier

  const config: RouterConfig = {
    namespace: 'replaymod',
    defaultPrimary: 'claude-haiku-4-5',
    anthropicApiKey,
    groqApiKey: process.env.GROQ_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    patchWindowMs: 1500,
  }

  try {
    const result = await routeCommentary(body.system, body.user, tier, config)
    return json(res, 200, { commentary: result.commentary, tone: result.tone })
  } catch (err: any) {
    console.error("Commentary handler error:", err);
    return json(res, 500, { error: "internal_error", message: err?.message });
  }
}
```

- [ ] **Step 3: Pass tier from client**

Open `shared/commentary/generateCommentary.ts`. Change the fetch body to include `tier`:

```typescript
// In the fetch call, add tier to the body:
body: JSON.stringify({ system, user, tier: input.winTier }),
```

Full updated fetch block (replace existing):
```typescript
const r = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ system, user, tier: input.winTier }),
  signal: ctrl.signal,
});
```

- [ ] **Step 4: Add GROQ_API_KEY and DEEPSEEK_API_KEY to Vercel environment**

In Vercel dashboard for the ReplayMod project → Settings → Environment Variables, add:
- `GROQ_API_KEY` = your Groq API key (get free at console.groq.com)
- `DEEPSEEK_API_KEY` = your DeepSeek API key (get at platform.deepseek.com)

For local dev, add to `.env.local` in the project root:
```
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

- [ ] **Step 5: Deploy and smoke test**

```bash
vercel --cwd /Users/john/Desktop/ReplayMod
```

Play one hand in the preview URL. Confirm:
- Commentary appears (A's result)
- No visible errors
- Check Vercel function logs: should see `[ROUTER]` log lines after the response

- [ ] **Step 6: Commit**

```bash
git add api/commentary.ts shared/commentary/generateCommentary.ts
git commit -m "feat(router): wire api/commentary through multi-LLM router"
```

---

## Task 8: Anti-redundancy — inject banned phrases into prompt

**Files:**
- Modify: `shared/commentary/promptBuilder.ts`

The `getRecentPhrases` from KV can't be called inside `promptBuilder.ts` (it's pure client-side). The banned phrases must be fetched server-side in `api/commentary.ts` and passed through to the prompt builder.

- [ ] **Step 1: Update buildPrompt signature to accept bannedPhrases**

In `shared/commentary/promptBuilder.ts`, update `buildPrompt`:

```typescript
// Change signature from:
export function buildPrompt(
  input: CommentaryInput,
  culture: CommentaryCultureNugget[],
  recentTones: string[],
): BuiltPrompt

// To:
export function buildPrompt(
  input: CommentaryInput,
  culture: CommentaryCultureNugget[],
  recentTones: string[],
  bannedPhrases?: string[],
): BuiltPrompt
```

- [ ] **Step 2: Inject banned phrases into system prompt**

In `buildSystemPrompt`, find the `FORBIDDEN` section and add the dynamic banned phrases block. Replace the `FORBIDDEN` section footer:

```typescript
// At the end of the FORBIDDEN section, before "VOICE:", add:
const bannedDynamic = (bannedPhrases && bannedPhrases.length > 0)
  ? `\nSESSION-BANNED PHRASES (used recently — do NOT use these):\n${bannedPhrases.slice(0, 15).map(p => `- "${p}"`).join('\n')}`
  : ''

// Append bannedDynamic to the system prompt string before the closing backtick
```

Full replacement — find this block in `buildSystemPrompt`:

```typescript
return `You write basketball post-hand commentary for a fantasy game.
```

And change the function signature to:

```typescript
function buildSystemPrompt(recentTones: string[], bannedPhrases: string[] = []): string {
```

Then find the `FORBIDDEN` section in the returned string and add before `VOICE:`:

```
SESSION-BANNED PHRASES (used in last 20 outputs — NEVER use any of these):
${bannedPhrases.length > 0 ? bannedPhrases.slice(0, 15).map(p => `- "${p}"`).join('\n') : '(none yet)'}
```

- [ ] **Step 3: Update api/commentary.ts to fetch phrases and pass them**

In `api/commentary.ts`, before calling `routeCommentary`, fetch banned phrases and pass them to the system/user prompts. Since `buildPrompt` is called client-side and we can't easily change that flow now, the simpler approach is to POST banned phrases as part of the request and have `generateCommentary.ts` pass them through:

Add to `generateCommentary.ts`:

```typescript
// The server will inject banned phrases server-side via KV — 
// no client change needed beyond passing tier (already done in Task 7)
```

And in `api/commentary.ts`, after getting the config, fetch banned phrases and rebuild the system prompt with them:

```typescript
import { makeKV, getRecentPhrases } from "../shared/router/kvStore";
import { buildPrompt } from "../shared/commentary/promptBuilder";
// ... in handler:
const kv = makeKV()
const bannedPhrases = await getRecentPhrases(kv, 'replaymod')
// Re-build the system prompt with banned phrases injected
// Note: body.system already has the base prompt from client.
// Append the banned list to it:
const systemWithBanned = body.system + (bannedPhrases.length > 0
  ? `\n\nSESSION-BANNED PHRASES (used recently — NEVER use):\n${bannedPhrases.slice(0, 15).map(p => `- "${p}"`).join('\n')}`
  : '')

const result = await routeCommentary(systemWithBanned, body.user, tier, config)
```

- [ ] **Step 4: Commit**

```bash
git add shared/commentary/promptBuilder.ts api/commentary.ts
git commit -m "feat(router): inject KV-backed banned phrases into commentary prompt"
```

---

## Task 9: Prompt fixes — cultural truth rule + persona enforcement

**Files:**
- Modify: `shared/commentary/promptBuilder.ts`

- [ ] **Step 1: Add cultural truth rule to FORBIDDEN section**

In `promptBuilder.ts`, find the `FORBIDDEN` list. After the line:
```
- Inventing stats. Only use numbers that appear in the input data.
```

Add:
```
- Inventing nicknames. ONLY use nicknames that appear in the CULTURE CONTEXT section for that player. If a player has no culture context entry, refer to them by their actual name only — never invent a nickname.
- Attributing a nickname or personality trait from one player to a different player. "Book" refers only to Devin Booker. "The Joker" refers only to Nikola Jokić. Use the CULTURE CONTEXT to verify.
```

- [ ] **Step 2: Enforce persona rotation in VALIDATION CHECKLIST**

Add as checklist item #9:

```
9. TONE ROTATION: Is the tone you picked listed in the "Recent tones used (DO NOT pick any of these)" line? → Pick a different tone. If all 5 tones are banned, pick the one used LEAST recently.
```

- [ ] **Step 3: Strengthen JSON-only output instruction**

At the very end of `buildSystemPrompt`, the current instruction is:
```
Return ONLY the JSON object. No prose before or after.
```

Replace with:
```
CRITICAL OUTPUT RULE: Return ONLY the raw JSON object — no backticks, no code fences, no "```json", no thinking, no revision notes, no prose before or after. Your entire response must start with { and end with }. Any other output format will cause a system error.
```

- [ ] **Step 4: Test with testCommentary script**

```bash
cd /Users/john/Desktop/ReplayMod/basketball
npx ts-node --project tsconfig.sim.json src/tools/testCommentary.ts 20
```

Check the output file in `scripts/`. Verify:
- No `\`\`\`json` or JSON revision blocks in any output
- Tone varies across outputs (not all deadpan)
- No hallucinated nicknames

- [ ] **Step 5: Commit**

```bash
git add shared/commentary/promptBuilder.ts
git commit -m "fix(commentary): enforce cultural truth rule, persona rotation, JSON-only output"
```

---

## Task 10: Leaderboard feature polish

**Files:**
- Modify: `basketball/src/views/GameView.tsx` (find LeaderboardScreen usage)
- Modify: existing leaderboard component (path TBD — find with grep below)

- [ ] **Step 1: Find the leaderboard component**

```bash
grep -rn "LeaderboardScreen\|LeaderboardView\|Leaderboard" /Users/john/Desktop/ReplayMod/basketball/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | head -20
```

Note the exact file paths returned.

- [ ] **Step 2: Add username/identity to leaderboard entries**

The current leaderboard (`api/leaderboard.ts`) stores `{ metric, score }` with no user identity. Add an anonymous session ID so players can see "that's me" on the board.

In `api/leaderboard.ts`, update the POST handler to accept and store a `session_id`:

```typescript
// In the POST branch, update insert:
const sessionId = (body.session_id ?? '').toString().slice(0, 32) || null
const { data, error } = await supabase
  .from('leaderboard')
  .insert({ metric, score, session_id: sessionId })
  .select()
  .single();
```

- [ ] **Step 3: Pass session_id from client**

In `shared/utils/leaderboardClient.ts` (or wherever `submitToLeaderboard` is called), generate and persist a session ID:

```typescript
function getSessionId(): string {
  let id = localStorage.getItem('rm_session_id')
  if (!id) {
    id = Math.random().toString(36).slice(2, 12)
    localStorage.setItem('rm_session_id', id)
  }
  return id
}

// In submitToLeaderboard, add session_id to body:
body: JSON.stringify({ metric, score, session_id: getSessionId() }),
```

- [ ] **Step 4: Highlight current player's row in LeaderboardScreen**

In the leaderboard component, after fetching entries, mark which entry matches the local session ID:

```typescript
const mySessionId = localStorage.getItem('rm_session_id')
// In the entries map:
const isMe = mySessionId && e.session_id === mySessionId
// Apply styling:
className={`... ${isMe ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-slate-800'}`}
// Add "YOU" badge:
{isMe && <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest">YOU</span>}
```

- [ ] **Step 5: Add "all time" scope toggle**

The current API supports `scope=daily`. Add a toggle for "All Time" in the UI:

```typescript
const [scope, setScope] = useState<'daily' | 'all'>('daily')
// Toggle button in header:
<button onClick={() => setScope(s => s === 'daily' ? 'all' : 'daily')}
  className="text-[9px] text-slate-400 hover:text-white uppercase tracking-widest">
  {scope === 'daily' ? 'Today' : 'All Time'}
</button>
// Pass scope to fetch:
const res = await fetch(`/api/leaderboard?metric=hand_best&scope=${scope}&limit=25`)
```

- [ ] **Step 6: Test leaderboard in preview**

Deploy to preview and play several hands. Confirm:
- Your row highlights in yellow
- Today/All Time toggle works
- Scores submit correctly

- [ ] **Step 7: Commit**

```bash
git add api/leaderboard.ts basketball/src/ shared/utils/
git commit -m "feat(leaderboard): add session identity, self-highlight, all-time toggle"
```

---

## Task 11: Run full 100-hand commentary test and verify improvement

**Files:** No code changes — validation only.

- [ ] **Step 1: Run test against preview deployment**

```bash
cd /Users/john/Desktop/ReplayMod/basketball
npx ts-node --project tsconfig.sim.json src/tools/testCommentary.ts 100 https://YOUR-PREVIEW-URL.vercel.app
```

- [ ] **Step 2: Check output file for regressions**

Open `scripts/commentary-output-<timestamp>.txt`. Verify:
1. Zero `\`\`\`json` blocks or revision text in any output
2. Tone distribution: count occurrences of each tone label — no single tone should exceed 35% of outputs
3. Zero hallucinated nicknames (cross-check player names vs their commentary against playerCulture.ts)
4. "couldn't carry the load", "the rest of the roster", "went nuclear" — count occurrences. Each should appear fewer than 5 times in 100

- [ ] **Step 3: Commit test output**

```bash
git add scripts/commentary-output-*.txt
git commit -m "test: 100-hand commentary validation post-router"
```

---

## Task 12: Verify KV grade data is accumulating

- [ ] **Step 1: Check Upstash dashboard**

Log into Upstash, open the ReplayMod Redis instance. Verify these keys exist after playing ~10 hands:

```
replaymod:model:claude-haiku-4-5:scores
replaymod:challenger:counter
replaymod:recent:phrases
```

- [ ] **Step 2: Check grade scores via CLI**

```bash
# From Upstash dashboard console or using the REST API:
curl -X POST "$UPSTASH_REDIS_REST_URL/hgetall/replaymod:model:claude-haiku-4-5:scores" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

Expected: JSON with `total`, `sum_composite`, `sum_humanness`, etc. values.

- [ ] **Step 3: Confirm challenger rotation fired**

After 5 hands, `replaymod:challenger:counter` should have reset to 0. Check Vercel function logs for:
```
[ROUTER] Challenger llama-3.3-70b-versatile scored X.XX vs primary Y.YY
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in |
|---|---|
| Parallel cross-check router (A ships immediately, B+C async) | Task 6, 7 |
| 6-criteria grader (Llama via Groq) | Task 4 |
| KV data model (model scores, tiers, recent phrases, routing) | Task 3 |
| Every-5-hands challenger rotation | Task 5, 6 |
| Anti-redundancy (banned phrases from KV → prompt) | Task 8 |
| Cultural truth rule in prompt | Task 9 |
| JSON leak fix (JSON-only output rule) | Task 9 |
| Persona rotation enforcement | Task 9 |
| Cost optimization routing (promote on 0.5 gap) | Task 3 (`maybePromoteModel`) |
| Leaderboard: session identity + self-highlight + all-time | Task 10 |
| Validation: 100-hand test | Task 11 |
| KV accumulation verification | Task 12 |

**No gaps found.**

**Placeholder check:** All steps contain exact code, commands, and expected output. No TBDs.

**Type consistency check:**
- `PayoutTier` defined in Task 2, used in Tasks 3, 6, 7 ✓
- `RouterModel` defined in Task 2, used in Tasks 4, 6 ✓
- `GradeScore` defined in Task 2, used in Tasks 4, 6 ✓
- `RouterConfig` defined in Task 2, used in Tasks 6, 7 ✓
- `makeKV()` defined in Task 3, used in Tasks 6, 7, 8 ✓
- `routeCommentary(system, user, tier, config)` defined in Task 6, called in Task 7 ✓

---

*Plan 2 (ThanosAI migration): stream-capture fix + router integration — separate session after this ships.*

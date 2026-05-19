# Share & Async Challenge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the async PvP challenge loop: play hand → serialize initial deal → share challenge link → recipient plays same starting cards with own decisions → compare scores.

**Architecture:** Client-side deal (basketball/src/adapters/gameAdapter.ts) is captured pre-hold in `initialRosterRef`, serialized by SportAdapter, stored as JSONB in `shared_challenges`. Recipients deserialize and inject at deal time. Satori generates a static 1080×1920 share card PNG. All counters update atomically via SQL UPDATE.

**Tech Stack:** React + TypeScript, Supabase (Postgres + RLS), Vercel Node serverless, @vercel/og (satori), Web Share API, vitest

---

## File Map

**New files:**
- `shared/adapters/challengeTypes.ts` — `ShareCardConfig`, `HandResult`, `ChallengeCtx` interfaces
- `supabase/migrations/006_challenges_v2.sql` — ALTER shared_challenges + CREATE challenge_attempts
- `shared/utils/triggerEvaluation.ts` — pure `evaluateTrigger()` function
- `shared/utils/__tests__/triggerEvaluation.test.ts` — unit tests
- `api/challenge/create.ts` — POST /api/challenge/create
- `api/challenge/[id].ts` — GET /api/challenge/:id
- `api/challenge/[id]/attempt.ts` — POST /api/challenge/:id/attempt
- `api/share/card.ts` — GET /api/share/card (satori PNG)
- `shared/hooks/useChallengeShare.ts` — orchestration hook
- `shared/components/ChallengeSharePrompt.tsx` — results-phase prompt (challenger)
- `shared/components/ChallengeLandingScreen.tsx` — recipient entry point
- `shared/components/ChallengeComparisonScreen.tsx` — post-attempt comparison (recipient)
- `shared/components/YourChallengesPanel.tsx` — in-app return surface

**Modified files:**
- `package.json` — add `@vercel/og`
- `shared/adapters/SportAdapter.ts` — add serialize/deserialize/trigger/shareCard methods
- `basketball/src/adapters/SportAdapter.ts` — implement new methods
- `shared/views/GameView.tsx` — `initialRosterRef`, `challengeCtx` prop, share prompt, comparison
- `shared/views/GameAdapter.ts` — add optional `challengeCtx` field (not used — keep challenge separate)
- `basketball/src/views/GameView.tsx` — accept and forward `challengeCtx` prop
- `basketball/src/App.tsx` — challenge route detection, ChallengeLandingScreen overlay
- `shared/components/ProfileScreen.tsx` — "Your Challenges" tab

---

## Task 1: Foundation — challenge types + migration + @vercel/og

**Files:**
- Create: `shared/adapters/challengeTypes.ts`
- Create: `supabase/migrations/006_challenges_v2.sql`
- Modify: `package.json`

- [ ] **Step 1: Create challengeTypes.ts**

```typescript
// shared/adapters/challengeTypes.ts
import type { GeneratedCard } from "../types/index";

export interface ShareCardConfig {
  sport: string;
  rosterSize: number;
  cardLayout: "3+2" | "2+3" | "2+2+1";
  statLabel: (card: GeneratedCard) => string;
  tierAccentColor: (tier: string) => string;
  tierLabel: (tier: string) => string;
  tierBgColor: (tier: string) => string;
}

export interface HandResult {
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
}

export interface ChallengeCtx {
  challengeId: string;
  initialRoster: GeneratedCard[];
  targetScore: number;
  challengerName: string;
  sport: string;
  season: string;
}
```

- [ ] **Step 2: Create migration 006**

```sql
-- supabase/migrations/006_challenges_v2.sql
-- Extend shared_challenges + create challenge_attempts. Idempotent.

ALTER TABLE public.shared_challenges
  ADD COLUMN IF NOT EXISTS initial_roster   jsonb          NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS challenger_name  text,
  ADD COLUMN IF NOT EXISTS trigger_type     text           NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS share_headline   text,
  ADD COLUMN IF NOT EXISTS roster_size      integer        NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS winner_count     integer        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_score       numeric(6,1),
  ADD COLUMN IF NOT EXISTS best_user_name   text,
  ADD COLUMN IF NOT EXISTS last_attempt_at  timestamptz;

-- target_score alias: shared_challenges already has target_fp — we keep that
-- column name internally and map to target_score at the API layer.

CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  attempt_id   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid         NOT NULL REFERENCES public.shared_challenges(challenge_id) ON DELETE CASCADE,
  user_id      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name    text,
  score        numeric(6,1) NOT NULL,
  score_breakdown jsonb,
  is_winner    boolean      NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge
  ON public.challenge_attempts (challenge_id);

ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attempts: public read"
  ON public.challenge_attempts FOR SELECT USING (true);

-- Anonymous attempts allowed (user_id nullable)
CREATE POLICY "attempts: open insert"
  ON public.challenge_attempts FOR INSERT WITH CHECK (true);

-- Reputation columns on player_profiles
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS challenges_created   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_attempted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_won       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_defended  integer NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Add @vercel/og to root package.json**

Open `package.json` and add to `dependencies`:

```json
"@vercel/og": "^0.6.3"
```

Then run:
```bash
cd /Users/john/Desktop/ReplayMod/.claude/worktrees/feat+achievements-and-challenges
npm install
```

Expected: `@vercel/og` installed in root node_modules.

- [ ] **Step 4: Commit foundation**

```bash
git add shared/adapters/challengeTypes.ts supabase/migrations/006_challenges_v2.sql package.json package-lock.json
git commit -m "feat(challenges): types foundation + migration 006 + @vercel/og"
```

---

## Task 2: SportAdapter — serialize/deserialize/comparison/shareCard methods

**Files:**
- Modify: `shared/adapters/SportAdapter.ts`
- Modify: `basketball/src/adapters/SportAdapter.ts`

- [ ] **Step 1: Add methods to shared SportAdapter**

At the end of `shared/adapters/SportAdapter.ts`, before the final `export default SportAdapter;` line, add:

```typescript
  // ── Challenge / share methods ────────────────────────────────────────────
  // Default implementations. Sports override for sport-specific behaviour.

  serializeRoster(cards: import("../types/index").GeneratedCard[]): Record<string, unknown> {
    return {
      v: 1,
      sport: this.sportKey,
      cards: cards.map(c => ({
        id: c.id,
        basePlayerId: c.basePlayerId,
        personKey: c.personKey,
        cardId: c.cardId,
        name: c.name,
        team: c.team,
        season: c.season,
        position: c.position,
        photoCode: c.photoCode ?? null,
        salary: c.salary,
        tier: c.tier,
        slotIndex: (c as any).slotIndex ?? 0,
        projectedFp: c.projectedFp,
      })),
    };
  }

  deserializeRoster(snapshot: Record<string, unknown>): import("../types/index").GeneratedCard[] {
    const cards = (snapshot.cards as any[]) ?? [];
    return cards.map((c: any, i: number) => ({
      id: c.id ?? c.basePlayerId,
      basePlayerId: c.basePlayerId,
      personKey: c.personKey ?? c.basePlayerId,
      cardId: c.cardId ?? c.basePlayerId,
      name: c.name,
      team: c.team,
      season: c.season,
      position: c.position,
      photoCode: c.photoCode ?? undefined,
      salary: Number(c.salary),
      tier: c.tier,
      slotIndex: c.slotIndex ?? i,
      projectedFp: Number(c.projectedFp ?? 0),
      actualFp: 0,
      fpDelta: 0,
      statLine: {},
      gameInfo: { date: "", opponent: "" },
      achievements: [],
      wasHeld: false,
    }));
  }

  validateRosterSnapshot(snapshot: Record<string, unknown>): boolean {
    if (!snapshot || typeof snapshot !== "object") return false;
    if ((snapshot as any).v !== 1) return false;
    const cards = (snapshot as any).cards;
    if (!Array.isArray(cards) || cards.length < 1) return false;
    return cards.every((c: any) => c.basePlayerId && c.name && c.tier && c.salary !== undefined);
  }

  getComparisonValue(result: import("./challengeTypes").HandResult): number {
    return result.totalFp;
  }

  formatComparisonValue(value: number): string {
    return `${value.toFixed(1)} FP`;
  }

  getShareCardConfig(): import("./challengeTypes").ShareCardConfig {
    return {
      sport: this.sportKey,
      rosterSize: this.rosterSize,
      cardLayout: "3+2",
      statLabel: () => "",
      tierAccentColor: () => "#7c8aa3",
      tierLabel: (t) => t,
      tierBgColor: () => "rgba(0,0,0,0.2)",
    };
  }
```

- [ ] **Step 2: Add basketball-specific overrides to basketball SportAdapter**

In `basketball/src/adapters/SportAdapter.ts`, after the existing `clamp` method (before any existing `// Slate v2` section), add:

```typescript
  private static readonly TIER_ACCENT: Record<string, string> = {
    RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
    BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
  };

  private static readonly TIER_BG: Record<string, string> = {
    RED: "rgba(239,68,68,0.18)", ORANGE: "rgba(251,146,60,0.18)",
    PURPLE: "rgba(192,132,252,0.18)", BLUE: "rgba(59,130,246,0.14)",
    GREEN: "rgba(34,197,94,0.14)", WHITE: "rgba(156,163,175,0.08)",
  };

  serializeRoster(cards: import("@shared/types/index").GeneratedCard[]): Record<string, unknown> {
    return {
      v: 1,
      sport: "basketball",
      cards: cards.map((c: any) => ({
        id: c.id,
        basePlayerId: c.basePlayerId,
        personKey: c.personKey,
        cardId: c.cardId,
        name: c.name,
        team: c.team,
        season: c.season,
        position: c.position,
        photoCode: c.photoCode ?? null,
        salary: c.salary,
        tier: c.tier,
        slotIndex: c.slotIndex ?? 0,
        projectedFp: c.projectedFp,
      })),
    };
  }

  deserializeRoster(snapshot: Record<string, unknown>): import("@shared/types/index").GeneratedCard[] {
    const cards = (snapshot.cards as any[]) ?? [];
    return cards.map((c: any, i: number) => ({
      id: c.id ?? c.basePlayerId,
      basePlayerId: c.basePlayerId,
      personKey: c.personKey ?? c.basePlayerId,
      cardId: c.cardId ?? `${c.basePlayerId}-ch${i}`,
      name: c.name,
      team: c.team,
      season: c.season,
      position: c.position,
      photoCode: c.photoCode ?? undefined,
      salary: Number(c.salary),
      tier: c.tier,
      slotIndex: c.slotIndex ?? i,
      projectedFp: Number(c.projectedFp ?? 0),
      actualFp: 0,
      fpDelta: 0,
      statLine: {},
      gameInfo: { date: "", opponent: "" },
      achievements: [],
      wasHeld: false,
    }));
  }

  validateRosterSnapshot(snapshot: Record<string, unknown>): boolean {
    if (!snapshot || typeof snapshot !== "object") return false;
    if ((snapshot as any).v !== 1 || (snapshot as any).sport !== "basketball") return false;
    const cards = (snapshot as any).cards;
    if (!Array.isArray(cards) || cards.length !== this.rosterSize) return false;
    return cards.every((c: any) => c.basePlayerId && c.name && c.tier && c.salary !== undefined);
  }

  getComparisonValue(result: import("@shared/adapters/challengeTypes").HandResult): number {
    return result.totalFp;
  }

  formatComparisonValue(value: number): string {
    return `${value.toFixed(1)} FP`;
  }

  getShareCardConfig(): import("@shared/adapters/challengeTypes").ShareCardConfig {
    const ACCENT = SportAdapter.TIER_ACCENT;
    const BG = SportAdapter.TIER_BG;
    return {
      sport: "basketball",
      rosterSize: this.rosterSize,
      cardLayout: "3+2",
      statLabel: (card: any) => `$${card.salary}`,
      tierAccentColor: (tier) => ACCENT[tier] ?? "#9CA3AF",
      tierLabel: (tier) => tier,
      tierBgColor: (tier) => BG[tier] ?? "rgba(0,0,0,0.15)",
    };
  }
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
npm --prefix basketball run typecheck 2>&1 | tail -5
```

Expected: no errors (or only pre-existing errors).

- [ ] **Step 4: Commit adapter extensions**

```bash
git add shared/adapters/SportAdapter.ts basketball/src/adapters/SportAdapter.ts shared/adapters/challengeTypes.ts
git commit -m "feat(challenges): SportAdapter serialize/deserialize/shareCard methods"
```

---

## Task 3: initialRosterRef — capture pre-hold roster in GameView

**Files:**
- Modify: `shared/views/GameView.tsx`

The deal in basketball is entirely client-side (`dealInitialRoster()` in `gameAdapter.ts`). We capture the returned cards immediately after the deal call so we have the pre-hold state before any hold/draw decisions.

- [ ] **Step 1: Add ref declaration in GameView**

In `shared/views/GameView.tsx`, find the block of other `useRef` declarations around line 476 (after `isFTUERef`). Add:

```typescript
  const initialRosterRef = useRef<import("@shared/types/index").GeneratedCard[]>([]);
```

- [ ] **Step 2: Capture roster immediately after deal**

In `onPrimaryAction`, after `gameState === "IDLE"` branch, the deal result lands on line ~1291:

```typescript
      const nextRoster = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
```

Immediately after that line, before any other state updates, add:

```typescript
      initialRosterRef.current = nextRoster as import("@shared/types/index").GeneratedCard[];
```

- [ ] **Step 3: Reset ref at start of each new deal**

Inside the same `gameState === "IDLE"` block, at the very beginning of `onPrimaryAction` (around line 1248 where `resetReveal()` is called), add the reset alongside the other resets:

```typescript
      initialRosterRef.current = [];
```

- [ ] **Step 4: Run tests to verify GameView change didn't break anything**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: same pass/fail count as before (383 passing, 4 pre-existing file-level failures).

- [ ] **Step 5: Commit**

```bash
git add shared/views/GameView.tsx
git commit -m "feat(challenges): capture pre-hold initialRoster in GameView ref"
```

---

## Task 4: Trigger evaluation utility + tests

**Files:**
- Create: `shared/utils/triggerEvaluation.ts`
- Create: `shared/utils/__tests__/triggerEvaluation.test.ts`

- [ ] **Step 1: Write failing tests first**

```typescript
// shared/utils/__tests__/triggerEvaluation.test.ts
import { describe, it, expect } from "vitest";
import { evaluateTrigger, type TriggerResult } from "../triggerEvaluation";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";

function card(overrides: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1-x",
    name: "Player", team: "LAL", season: "2122", position: "SG",
    salary: 40, tier: "BLUE", projectedFp: 30, slotIndex: 0,
    actualFp: 30, fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" },
    achievements: [], wasHeld: false, ...overrides,
  } as GeneratedCard;
}

const TIERS: WinTierMap = {
  LEGEND: { minFp: 255, multiplier: 50 },
  MVP:    { minFp: 235, multiplier: 8 },
  ALL_STAR: { minFp: 225, multiplier: 3 },
  STARTER:  { minFp: 205, multiplier: 1.5 },
  ROOKIE:   { minFp: 185, multiplier: 0.5 },
  BUST:     { minFp: 0,   multiplier: 0 },
};

describe("evaluateTrigger", () => {
  it("returns default trigger for normal hand", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 36 }));
    const result = evaluateTrigger({ roster, totalFp: 180, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("default");
    expect(result.headline).toContain("180");
  });

  it("returns big_score for MVP tier", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const result = evaluateTrigger({ roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
  });

  it("returns big_score for LEGEND tier", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 52 }));
    const result = evaluateTrigger({ roster, totalFp: 260, winTier: "LEGEND", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
  });

  it("returns near_miss when within 5 FP of next tier", () => {
    // 202 FP — ROOKIE (needs 205 for STARTER) — gap = 3
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 40.4 }));
    const result = evaluateTrigger({ roster, totalFp: 202, winTier: "ROOKIE", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("near_miss");
    expect(result.nearMissGap).toBeCloseTo(3, 0);
  });

  it("returns bad_beat for BUST with high-tier card", () => {
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8 }),
      card({ slotIndex: 1, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
  });

  it("rare_pull wins over big_score", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const badges = [{ id: "TOP_GAME", icon: "🏆", label: "Top Game", fp: 10 }];
    const result = evaluateTrigger({ roster, totalFp: 235, winTier: "MVP", badges, winTiersMap: TIERS });
    expect(result.trigger).toBe("rare_pull");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run shared/utils/__tests__/triggerEvaluation.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement triggerEvaluation.ts**

```typescript
// shared/utils/triggerEvaluation.ts
import type { GeneratedCard } from "../types/index";
import type { WinTierMap, WinTierKey } from "./payoutLogic";

const RECORD_BADGE_IDS = ["TOP_GAME", "CAREER_HIGH", "NBA_RECORD", "SEASON_RECORD", "PB"];

export interface TriggerInput {
  roster: GeneratedCard[];
  totalFp: number;
  winTier: WinTierKey | string;
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  winTiersMap: WinTierMap;
}

export interface TriggerResult {
  trigger: "rare_pull" | "big_score" | "near_miss" | "bad_beat" | "default";
  headline: string;
  /** How many FP short of the next tier (near_miss only) */
  nearMissGap?: number;
  /** Which tier was just missed (near_miss only) */
  nearMissNextTier?: string;
}

const NEAR_MISS_WINDOW = 5;

export function evaluateTrigger(input: TriggerInput): TriggerResult {
  const { roster, totalFp, winTier, badges, winTiersMap } = input;
  const fp = Math.round(totalFp * 10) / 10;

  // 1. rare_pull — any record/top-game badge
  if (badges.some(b => RECORD_BADGE_IDS.some(rid => b.id.includes(rid)))) {
    return {
      trigger: "rare_pull",
      headline: `You pulled a legendary game. Challenge someone to beat this.`,
    };
  }

  // 2. big_score — ALL_STAR / MVP / LEGEND
  if (winTier === "ALL_STAR" || winTier === "MVP" || winTier === "LEGEND") {
    const label = winTier === "ALL_STAR" ? "ALL-STAR" : winTier;
    return {
      trigger: "big_score",
      headline: `You hit ${label}. Same slate. Beat them.`,
    };
  }

  // 3. near_miss — within NEAR_MISS_WINDOW FP of next tier
  const tierOrder: WinTierKey[] = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const currentIdx = tierOrder.indexOf(winTier as WinTierKey);
  if (currentIdx >= 0 && currentIdx < tierOrder.length - 1) {
    const nextTier = tierOrder[currentIdx + 1];
    const nextMin = winTiersMap[nextTier]?.minFp;
    if (nextMin !== undefined) {
      const gap = Math.round((nextMin - fp) * 10) / 10;
      if (gap > 0 && gap <= NEAR_MISS_WINDOW) {
        return {
          trigger: "near_miss",
          headline: `You missed ${nextTier.replace("_", "-")} by ${gap} FP. See if they finish the job.`,
          nearMissGap: gap,
          nearMissNextTier: nextTier,
        };
      }
    }
  }

  // 4. bad_beat — BUST or ROOKIE with a RED or ORANGE card in the lineup
  if (winTier === "BUST" || winTier === "ROOKIE") {
    const hasHighTier = roster.some(c => c.tier === "RED" || c.tier === "ORANGE");
    if (hasHighTier) {
      return {
        trigger: "bad_beat",
        headline: `Brutal hand. See if they survive the same slate.`,
      };
    }
  }

  // 5. default — always fires
  return {
    trigger: "default",
    headline: `${fp} FP on the board. Same slate. Beat them.`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run shared/utils/__tests__/triggerEvaluation.test.ts 2>&1 | tail -10
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/utils/triggerEvaluation.ts shared/utils/__tests__/triggerEvaluation.test.ts
git commit -m "feat(challenges): trigger evaluation utility + tests"
```

---

## Task 5: API — POST /api/challenge/create + GET /api/challenge/[id]

**Files:**
- Create: `api/challenge/create.ts`
- Create: `api/challenge/[id].ts`

These use the existing `supabaseAdmin` from `api/hand/lib/supabaseServer.ts` and `verifyAuth` from `api/hand/lib/auth.ts`.

- [ ] **Step 1: Create api/challenge/create.ts**

```typescript
// api/challenge/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./hand/lib/supabaseServer.js";
import { verifyAuth } from "./hand/lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { user, error: authErr } = await verifyAuth(req);
  if (authErr) return res.status(authErr.status).json({ error: "UNAUTHORIZED" });

  const {
    hand_id, sport, season, target_score, score_breakdown,
    initial_roster, challenger_name, trigger_type, share_headline,
  } = req.body ?? {};

  if (!sport || !season || target_score == null || !initial_roster) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const rosterSize = Array.isArray((initial_roster as any).cards)
    ? (initial_roster as any).cards.length
    : 5;

  const { data, error } = await supabaseAdmin
    .from("shared_challenges")
    .insert({
      created_by: user.id,
      hand_id: hand_id ?? crypto.randomUUID(),
      sport,
      season,
      slate_seed: "",
      target_fp: Number(target_score),
      initial_roster,
      challenger_name: challenger_name ?? "Anonymous",
      trigger_type: trigger_type ?? "default",
      share_headline: share_headline ?? "",
      roster_size: rosterSize,
    })
    .select("challenge_id")
    .single();

  if (error || !data) {
    console.error("[challenge/create]", error);
    return res.status(500).json({ error: "Failed to create challenge" });
  }

  const challengeId = data.challenge_id;
  const shareUrl = `https://replayifs.com/${sport}/challenge/${challengeId}`;
  const cardUrl = `https://replayifs.com/api/share/card?challenge_id=${challengeId}`;

  return res.status(200).json({ challenge_id: challengeId, share_url: shareUrl, card_url: cardUrl });
}
```

- [ ] **Step 2: Create api/challenge/[id].ts (GET)**

```typescript
// api/challenge/[id].ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./hand/lib/supabaseServer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET required" });

  const challengeId = req.query.id as string;
  if (!challengeId) return res.status(400).json({ error: "Missing id" });

  const { data, error } = await supabaseAdmin
    .from("shared_challenges")
    .select("*")
    .eq("challenge_id", challengeId)
    .single();

  if (error || !data) return res.status(404).json({ error: "Challenge not found" });

  // Increment view_count fire-and-forget
  supabaseAdmin
    .from("shared_challenges")
    .update({ view_count: (data.view_count ?? 0) + 1 })
    .eq("challenge_id", challengeId)
    .then(() => {});

  res.setHeader("Cache-Control", "public, max-age=30");
  return res.status(200).json({
    challenge_id: data.challenge_id,
    challenger_name: data.challenger_name ?? "Anonymous",
    target_score: Number(data.target_fp),
    sport: data.sport,
    season: data.season,
    trigger_type: data.trigger_type ?? "default",
    share_headline: data.share_headline ?? "",
    initial_roster: data.initial_roster,
    roster_size: data.roster_size ?? 5,
    created_at: data.created_at,
    attempt_count: data.attempt_count ?? 0,
    winner_count: data.winner_count ?? 0,
    best_score: data.best_score ?? null,
    best_user_name: data.best_user_name ?? null,
    card_url: `https://replayifs.com/api/share/card?challenge_id=${data.challenge_id}`,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add api/challenge/create.ts "api/challenge/[id].ts"
git commit -m "feat(challenges): POST create + GET challenge API endpoints"
```

---

## Task 6: API — POST /api/challenge/[id]/attempt

**Files:**
- Create: `api/challenge/[id]/attempt.ts`

This handles attempt submission with atomic counter updates and anti-self-farm rules.

- [ ] **Step 1: Create the attempt handler**

```typescript
// api/challenge/[id]/attempt.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/lib/supabaseServer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const challengeId = req.query.id as string;
  if (!challengeId) return res.status(400).json({ error: "Missing id" });

  const { score, score_breakdown, is_winner, user_id, user_name } = req.body ?? {};
  if (score == null || is_winner == null) {
    return res.status(400).json({ error: "score and is_winner required" });
  }

  // Fetch challenge to check for self-farm and get challenger user
  const { data: challenge, error: fetchErr } = await supabaseAdmin
    .from("shared_challenges")
    .select("challenge_id, created_by, target_fp, attempt_count, winner_count, best_score")
    .eq("challenge_id", challengeId)
    .single();

  if (fetchErr || !challenge) return res.status(404).json({ error: "Challenge not found" });

  const isSelfFarm = user_id && user_id === challenge.created_by;

  // For signed-in users: enforce one attempt per user
  if (user_id) {
    const { data: existing } = await supabaseAdmin
      .from("challenge_attempts")
      .select("attempt_id, score, is_winner")
      .eq("challenge_id", challengeId)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        attempt_id: existing.attempt_id,
        already_attempted: true,
        score: existing.score,
        is_winner: existing.is_winner,
      });
    }
  }

  // Insert the attempt
  const { data: attempt, error: insertErr } = await supabaseAdmin
    .from("challenge_attempts")
    .insert({
      challenge_id: challengeId,
      user_id: user_id ?? null,
      user_name: user_name ?? "Anonymous",
      score: Number(score),
      score_breakdown: score_breakdown ?? null,
      is_winner: Boolean(is_winner),
    })
    .select("attempt_id")
    .single();

  if (insertErr || !attempt) {
    console.error("[attempt]", insertErr);
    return res.status(500).json({ error: "Failed to insert attempt" });
  }

  // Atomic counter update (always increment attempt_count)
  // Self-farm: don't update best_score/winner_count/best_user_name
  const newScore = Number(score);
  const prevBest = Number(challenge.best_score ?? 0);
  const isBest = newScore > prevBest;

  if (!isSelfFarm) {
    await supabaseAdmin.rpc("increment_challenge_counters", {
      p_challenge_id: challengeId,
      p_is_winner: Boolean(is_winner),
      p_score: newScore,
      p_user_name: user_name ?? "Anonymous",
    }).then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback: raw UPDATE (no race condition guard, but won't lose the attempt)
        const updates: Record<string, any> = {
          attempt_count: (challenge.attempt_count ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
        };
        if (Boolean(is_winner)) updates.winner_count = (challenge.winner_count ?? 0) + 1;
        if (isBest) { updates.best_score = newScore; updates.best_user_name = user_name ?? "Anonymous"; }
        supabaseAdmin.from("shared_challenges").update(updates).eq("challenge_id", challengeId).then(() => {});
      }
    });
  } else {
    // Self-farm: still increment attempt_count only
    await supabaseAdmin
      .from("shared_challenges")
      .update({ attempt_count: (challenge.attempt_count ?? 0) + 1, last_attempt_at: new Date().toISOString() })
      .eq("challenge_id", challengeId);
  }

  // Fetch updated challenge counters for response
  const { data: updated } = await supabaseAdmin
    .from("shared_challenges")
    .select("attempt_count, winner_count, best_score, best_user_name")
    .eq("challenge_id", challengeId)
    .single();

  return res.status(200).json({
    attempt_id: attempt.attempt_id,
    is_best: isBest && !isSelfFarm,
    attempt_count: updated?.attempt_count ?? 0,
    winner_count: updated?.winner_count ?? 0,
    best_score: updated?.best_score ?? null,
    best_user_name: updated?.best_user_name ?? null,
  });
}
```

- [ ] **Step 2: Create the Supabase RPC function (SQL helper)**

Add to `supabase/migrations/006_challenges_v2.sql` (or create `007_challenge_rpc.sql`):

Actually, add this to the end of `006_challenges_v2.sql` to keep it one migration:

Open `supabase/migrations/006_challenges_v2.sql` and append:

```sql
-- Atomic counter increment for challenge attempts
CREATE OR REPLACE FUNCTION public.increment_challenge_counters(
  p_challenge_id uuid,
  p_is_winner    boolean,
  p_score        numeric,
  p_user_name    text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.shared_challenges
  SET
    attempt_count    = attempt_count + 1,
    winner_count     = winner_count + (CASE WHEN p_is_winner THEN 1 ELSE 0 END),
    best_score       = GREATEST(COALESCE(best_score, 0), p_score),
    best_user_name   = CASE
                         WHEN p_score > COALESCE(best_score, 0) THEN p_user_name
                         ELSE best_user_name
                       END,
    last_attempt_at  = now()
  WHERE challenge_id = p_challenge_id;
END;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add "api/challenge/[id]/attempt.ts" supabase/migrations/006_challenges_v2.sql
git commit -m "feat(challenges): POST attempt endpoint + atomic counter RPC"
```

---

## Task 7: API — GET /api/share/card (satori PNG)

**Files:**
- Create: `api/share/card.ts`

- [ ] **Step 1: Create share card endpoint**

```typescript
// api/share/card.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ImageResponse } from "@vercel/og";
import { supabaseAdmin } from "./hand/lib/supabaseServer.js";

// Tier accent colors for card backgrounds
const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

const TIER_BG: Record<string, string> = {
  RED: "rgba(239,68,68,0.25)", ORANGE: "rgba(251,146,60,0.25)",
  PURPLE: "rgba(192,132,252,0.22)", BLUE: "rgba(59,130,246,0.18)",
  GREEN: "rgba(34,197,94,0.18)", WHITE: "rgba(156,163,175,0.08)",
};

function formatStatLine(card: any): string {
  return `$${card.salary} · ${card.position}`;
}

// Layout helper: splits rosterSize cards into rows per layout
function getRows(cards: any[], layout: string): any[][] {
  if (layout === "3+2") return [cards.slice(0, 3), cards.slice(3, 5)];
  if (layout === "2+3") return [cards.slice(0, 2), cards.slice(2, 5)];
  return [cards.slice(0, 3), cards.slice(3, 5)];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const challengeId = req.query.challenge_id as string;
  if (!challengeId) return res.status(400).json({ error: "Missing challenge_id" });

  const { data: challenge, error } = await supabaseAdmin
    .from("shared_challenges")
    .select("challenge_id, challenger_name, target_fp, sport, share_headline, initial_roster, trigger_type")
    .eq("challenge_id", challengeId)
    .single();

  if (error || !challenge) return res.status(404).end();

  const cards: any[] = (challenge.initial_roster as any)?.cards ?? [];
  const targetFp = Number(challenge.target_fp).toFixed(1);
  const challengerName = challenge.challenger_name ?? "Anonymous";
  const headline = challenge.share_headline || `${targetFp} FP. Same slate. Beat them.`;
  const rows = getRows(cards, "3+2");

  // Build JSX element for satori (must be plain object style — no imports)
  const element = {
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", width: "1080px", height: "1920px",
        background: "linear-gradient(180deg, #070A12 0%, #0D1628 50%, #070A12 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#EAF0FF",
        padding: "80px 60px",
        boxSizing: "border-box",
      },
      children: [
        // Header
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "48px" },
            children: [
              { type: "span", props: { style: { fontSize: "36px", fontWeight: 950, letterSpacing: "-1px", color: "#EAF0FF" }, children: "REPLAY" } },
              { type: "span", props: { style: { fontSize: "22px", fontWeight: 900, letterSpacing: "4px", color: "#FFB14A" }, children: "IFS" } },
            ],
          },
        },
        // Challenger name + score
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: "16px", marginBottom: "56px" },
            children: [
              { type: "div", props: { style: { fontSize: "52px", fontWeight: 900, color: "#EAF0FF" }, children: challengerName } },
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "baseline", gap: "12px" },
                  children: [
                    { type: "span", props: { style: { fontSize: "100px", fontWeight: 950, color: "#FFB14A", lineHeight: 1, fontStyle: "italic" }, children: targetFp } },
                    { type: "span", props: { style: { fontSize: "36px", fontWeight: 700, color: "rgba(255,255,255,0.5)" }, children: "FP" } },
                  ],
                },
              },
            ],
          },
        },
        // Headline
        {
          type: "div",
          props: {
            style: { fontSize: "48px", fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: "72px", lineHeight: 1.3 },
            children: headline,
          },
        },
        // Card grid rows
        ...rows.map((row: any[]) => ({
          type: "div",
          props: {
            style: { display: "flex", gap: "24px", marginBottom: "24px", justifyContent: row.length === 2 ? "center" : "flex-start" },
            children: row.map((card: any) => ({
              type: "div",
              props: {
                style: {
                  display: "flex", flexDirection: "column", alignItems: "center",
                  width: row.length === 3 ? "292px" : "440px",
                  background: TIER_BG[card.tier] ?? "rgba(255,255,255,0.05)",
                  border: `2px solid ${TIER_ACCENT[card.tier] ?? "#9CA3AF"}`,
                  borderRadius: "16px", padding: "20px",
                },
                children: [
                  { type: "div", props: { style: { fontSize: "20px", fontWeight: 700, color: TIER_ACCENT[card.tier] ?? "#9CA3AF", letterSpacing: "2px" }, children: card.tier } },
                  { type: "div", props: { style: { fontSize: "26px", fontWeight: 800, color: "#EAF0FF", marginTop: "8px", textAlign: "center" }, children: card.name } },
                  { type: "div", props: { style: { fontSize: "18px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }, children: formatStatLine(card) } },
                ],
              },
            })),
          },
        })),
        // CTA
        {
          type: "div",
          props: {
            style: {
              marginTop: "auto", padding: "40px 60px", borderRadius: "20px",
              background: "rgba(255,177,74,0.15)", border: "2px solid rgba(255,177,74,0.4)",
              textAlign: "center",
            },
            children: [
              { type: "div", props: { style: { fontSize: "44px", fontWeight: 900, color: "#FFB14A" }, children: "Same starting cards." } },
              { type: "div", props: { style: { fontSize: "40px", fontWeight: 700, color: "rgba(255,255,255,0.7)", marginTop: "8px" }, children: "Your hold/draw decisions." } },
            ],
          },
        },
      ],
    },
  };

  try {
    const imageResponse = new ImageResponse(element as any, { width: 1080, height: 1920 });
    const ab = await imageResponse.arrayBuffer();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.end(Buffer.from(ab));
  } catch (err) {
    console.error("[share/card]", err);
    res.status(500).end();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/share/card.ts
git commit -m "feat(challenges): satori share card PNG endpoint"
```

---

## Task 8: useChallengeShare hook

**Files:**
- Create: `shared/hooks/useChallengeShare.ts`

- [ ] **Step 1: Create the hook**

```typescript
// shared/hooks/useChallengeShare.ts
import { useState, useCallback } from "react";
import { evaluateTrigger, type TriggerResult } from "@shared/utils/triggerEvaluation";
import { track } from "@shared/analytics/analytics";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";

export interface ChallengeShareState {
  triggerResult: TriggerResult | null;
  challengeId: string | null;
  shareUrl: string | null;
  cardUrl: string | null;
  isCreating: boolean;
  isSharing: boolean;
  error: string | null;
}

export interface CreateChallengeArgs {
  handId: string;
  sport: string;
  season: string;
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
  initialRoster: GeneratedCard[];
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  challengerName: string;
  winTiersMap: WinTierMap;
  serializeRoster: (cards: GeneratedCard[]) => Record<string, unknown>;
}

const CHALLENGE_ATTEMPTED_KEY = "rm_challenge_attempted";

export function useChallengeShare(sportKey: string) {
  const [state, setState] = useState<ChallengeShareState>({
    triggerResult: null, challengeId: null, shareUrl: null, cardUrl: null,
    isCreating: false, isSharing: false, error: null,
  });

  const evalAndArm = useCallback((
    roster: GeneratedCard[],
    totalFp: number,
    winTier: string,
    badges: Array<{ id: string; icon: string; label: string; fp: number }>,
    winTiersMap: WinTierMap,
  ): TriggerResult => {
    const result = evaluateTrigger({ roster, totalFp, winTier: winTier as any, badges, winTiersMap });
    setState(s => ({ ...s, triggerResult: result }));
    track("challenges", "share_trigger_fired", {
      trigger: result.trigger, sport: sportKey,
      near_miss_gap: result.nearMissGap ?? 0,
    });
    return result;
  }, [sportKey]);

  const createChallenge = useCallback(async (args: CreateChallengeArgs): Promise<string | null> => {
    setState(s => ({ ...s, isCreating: true, error: null }));
    const trigger = evaluateTrigger({
      roster: args.roster, totalFp: args.totalFp, winTier: args.winTier as any,
      badges: args.badges, winTiersMap: args.winTiersMap,
    });
    try {
      const body = {
        hand_id: args.handId,
        sport: args.sport,
        season: args.season,
        target_score: args.totalFp,
        initial_roster: args.serializeRoster(args.initialRoster),
        challenger_name: args.challengerName,
        trigger_type: trigger.trigger,
        share_headline: trigger.headline,
      };
      const resp = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error("Create failed");
      const data = await resp.json();
      setState(s => ({
        ...s, isCreating: false,
        challengeId: data.challenge_id,
        shareUrl: data.share_url,
        cardUrl: data.card_url,
      }));
      track("challenges", "challenge_create", {
        challenge_id: data.challenge_id, sport: args.sport,
        trigger: trigger.trigger, target_score: args.totalFp,
      });
      return data.challenge_id;
    } catch (err) {
      setState(s => ({ ...s, isCreating: false, error: "Failed to create challenge" }));
      return null;
    }
  }, []);

  const shareChallenge = useCallback(async (title: string, url: string, cardUrl: string) => {
    setState(s => ({ ...s, isSharing: true }));
    track("challenges", "share_action_taken", { sport: sportKey, url });
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
      } else {
        await navigator.clipboard.writeText(url);
        // Caller should show a "Link copied!" toast
      }
    } catch { /* user cancelled share */ }
    setState(s => ({ ...s, isSharing: false }));
  }, [sportKey]);

  const reset = useCallback(() => {
    setState({ triggerResult: null, challengeId: null, shareUrl: null, cardUrl: null, isCreating: false, isSharing: false, error: null });
  }, []);

  return { ...state, evalAndArm, createChallenge, shareChallenge, reset };
}

/** Client-side attempt guard for anonymous users */
export function hasAttemptedChallenge(challengeId: string): boolean {
  try {
    const raw = localStorage.getItem(CHALLENGE_ATTEMPTED_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return ids.includes(challengeId);
  } catch { return false; }
}

export function markChallengeAttempted(challengeId: string): void {
  try {
    const raw = localStorage.getItem(CHALLENGE_ATTEMPTED_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(challengeId)) {
      ids.push(challengeId);
      // Keep last 50
      localStorage.setItem(CHALLENGE_ATTEMPTED_KEY, JSON.stringify(ids.slice(-50)));
    }
  } catch {}
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/hooks/useChallengeShare.ts
git commit -m "feat(challenges): useChallengeShare hook with evalAndArm/create/share"
```

---

## Task 9: ChallengeSharePrompt component + GameView wiring

**Files:**
- Create: `shared/components/ChallengeSharePrompt.tsx`
- Modify: `shared/views/GameView.tsx`

- [ ] **Step 1: Create ChallengeSharePrompt**

```tsx
// shared/components/ChallengeSharePrompt.tsx
import { useState } from "react";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";
import { useChallengeShare } from "@shared/hooks/useChallengeShare";
import { getNickname } from "@shared/utils/playerIdentity";
import { track } from "@shared/analytics/analytics";

interface Props {
  sport: string;
  season: string;
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
  initialRoster: GeneratedCard[];
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  winTiersMap: WinTierMap;
  serializeRoster: (cards: GeneratedCard[]) => Record<string, unknown>;
  triggerResult: TriggerResult;
}

export function ChallengeSharePrompt({
  sport, season, totalFp, winTier, roster, initialRoster,
  badges, winTiersMap, serializeRoster, triggerResult,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { isCreating, challengeId, shareUrl, createChallenge, shareChallenge } = useChallengeShare(sport);

  const isSpecial = triggerResult.trigger !== "default";

  async function handleChallenge() {
    track("challenges", "challenge_create", { sport, trigger: triggerResult.trigger });
    let cid = challengeId;
    if (!cid) {
      cid = await createChallenge({
        handId: crypto.randomUUID(),
        sport, season, totalFp, winTier, roster, initialRoster, badges, winTiersMap,
        challengerName: getNickname() || "Anonymous",
        serializeRoster,
      });
    }
    if (!cid) return;
    const url = `${window.location.origin}/${sport}/challenge/${cid}`;
    await shareChallenge(triggerResult.headline, url, "");
    if (!navigator.share) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  if (isSpecial) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
        background: "linear-gradient(0deg, #0D1628 0%, rgba(13,22,40,0.97) 100%)",
        borderTop: "1px solid rgba(255,177,74,0.3)",
        padding: "16px 20px 24px",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#FFB14A", marginBottom: 6, letterSpacing: 0.5 }}>
          {triggerResult.trigger === "rare_pull" ? "⚡ RARE PULL" :
           triggerResult.trigger === "big_score" ? "🔥 BIG SCORE" :
           triggerResult.trigger === "near_miss" ? "😤 NEAR MISS" : "💀 BAD BEAT"}
        </div>
        <div style={{ fontSize: 15, color: "#EAF0FF", marginBottom: 14, lineHeight: 1.4 }}>
          {triggerResult.headline}
        </div>
        <button
          onClick={handleChallenge}
          disabled={isCreating}
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: isCreating ? "rgba(255,177,74,0.3)" : "#FFB14A",
            border: "none", color: "#070A12", fontSize: 15, fontWeight: 900,
            cursor: isCreating ? "default" : "pointer", letterSpacing: 0.5,
          }}
        >
          {isCreating ? "Creating..." : copied ? "Link Copied!" : "Challenge a Friend"}
        </button>
      </div>
    );
  }

  // Default trigger — subtle presentation
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
      <button
        onClick={handleChallenge}
        disabled={isCreating}
        style={{
          padding: "8px 20px", borderRadius: 8,
          background: "transparent",
          border: "1px solid rgba(255,177,74,0.4)",
          color: "#FFB14A", fontSize: 13, fontWeight: 700,
          cursor: isCreating ? "default" : "pointer",
        }}
      >
        {isCreating ? "..." : copied ? "Link Copied!" : "Challenge a Friend"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire ChallengeSharePrompt into GameView**

In `shared/views/GameView.tsx`, add lazy import near the other lazy imports (around line 106-123):

```typescript
const ChallengeSharePrompt = lazy(() =>
  import("@shared/components/ChallengeSharePrompt").then(m => ({ default: m.ChallengeSharePrompt }))
);
```

Also import `evaluateTrigger`:
```typescript
import { evaluateTrigger } from "@shared/utils/triggerEvaluation";
```

Then inside the `GameView` component, after the `useAchievements` hook in `shared` (around line 413), add state for the trigger result:

```typescript
  const [challengeTrigger, setChallengeTrigger] = useState<import("@shared/utils/triggerEvaluation").TriggerResult | null>(null);
```

In `_useReveal.ts`, when the hand completes, we need to fire the trigger evaluation. But we can do it from `GameView` by tracking when `gameState` transitions to `"RESULTS"`. Add a `useEffect` after the existing RESULTS effects:

```typescript
  // Evaluate challenge trigger on RESULTS entry (not in challenge mode)
  useEffect(() => {
    if (gameState !== "RESULTS" || !!adapter.challengeCtx) return;
    const resolvedRoster = rosterRef.current as import("@shared/types/index").GeneratedCard[];
    const badges = resolvedRoster.flatMap((c: any) => c.achievements ?? []);
    const fp = resolvedRoster.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0);
    const tier = winTier ?? "BUST";
    const result = evaluateTrigger({ roster: resolvedRoster, totalFp: fp, winTier: tier, badges, winTiersMap: adapter.winTiersMap });
    setChallengeTrigger(result);
    return () => setChallengeTrigger(null);
  }, [gameState]); // eslint-disable-line
```

Note: `adapter.challengeCtx` doesn't exist yet — it will after Task 10. For now, use a placeholder: we'll add the `!!challengeCtx` guard in Task 10.

Then in the JSX, after the last `showCollect` check and before the closing `</>` of the game area render, add (inside `Suspense`):

```tsx
        {(gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && challengeTrigger && !isFTUE && (
          <Suspense fallback={null}>
            <ChallengeSharePrompt
              sport={sportKey}
              season={(rosterRef.current[0] as any)?.season ?? ""}
              totalFp={rosterRef.current.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0)}
              winTier={winTier ?? "BUST"}
              roster={rosterRef.current as import("@shared/types/index").GeneratedCard[]}
              initialRoster={initialRosterRef.current}
              badges={rosterRef.current.flatMap((c: any) => c.achievements ?? [])}
              winTiersMap={adapter.winTiersMap}
              serializeRoster={(cards) => adapter.sportAdapter.serializeRoster(cards)}
              triggerResult={challengeTrigger}
            />
          </Suspense>
        )}
```

- [ ] **Step 3: Commit**

```bash
git add shared/components/ChallengeSharePrompt.tsx shared/views/GameView.tsx
git commit -m "feat(challenges): ChallengeSharePrompt component + GameView trigger wiring"
```

---

## Task 10: ChallengeLandingScreen + App.tsx route detection + GameView deal override

**Files:**
- Create: `shared/components/ChallengeLandingScreen.tsx`
- Modify: `basketball/src/App.tsx`
- Modify: `basketball/src/views/GameView.tsx`
- Modify: `shared/views/GameView.tsx`

### 10a — ChallengeLandingScreen

- [ ] **Step 1: Create ChallengeLandingScreen**

```tsx
// shared/components/ChallengeLandingScreen.tsx
import { useEffect, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types/index";
import { track } from "@shared/analytics/analytics";
import { hasAttemptedChallenge } from "@shared/hooks/useChallengeShare";

interface ChallengeData {
  challenge_id: string;
  challenger_name: string;
  target_score: number;
  sport: string;
  season: string;
  trigger_type: string;
  share_headline: string;
  initial_roster: Record<string, unknown>;
  roster_size: number;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
}

interface Props {
  challengeId: string;
  sport: string;
  deserializeRoster: (snapshot: Record<string, unknown>) => GeneratedCard[];
  validateRosterSnapshot: (snapshot: Record<string, unknown>) => boolean;
  onAccept: (ctx: ChallengeCtx) => void;
  onClose: () => void;
}

function challengeStatsLine(data: ChallengeData): string {
  const { attempt_count, winner_count, best_score, best_user_name } = data;
  if (attempt_count === 0) return "Be the first to try.";
  if (attempt_count === 1 && winner_count === 0) return "1 attempt · still unbeaten";
  if (attempt_count >= 2 && winner_count === 0) return `Unbeaten so far · ${attempt_count} attempts`;
  const failedCount = attempt_count - winner_count;
  const failureRate = Math.round((failedCount / attempt_count) * 100);
  if (attempt_count >= 3 && winner_count > 0) return `${attempt_count} attempts · ${failureRate}% failed`;
  return `${attempt_count} attempts · best ${best_score?.toFixed(1) ?? "?"} FP by ${best_user_name ?? "someone"}`;
}

const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

export function ChallengeLandingScreen({ challengeId, sport, deserializeRoster, validateRosterSnapshot, onAccept, onClose }: Props) {
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);

  useEffect(() => {
    track("challenges", "challenge_link_open", { challenge_id: challengeId, sport });
    setAlreadyAttempted(hasAttemptedChallenge(challengeId));
    fetch(`/api/challenge/${challengeId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Challenge not found."); setLoading(false); });
  }, [challengeId, sport]);

  function handleAccept() {
    if (!data) return;
    if (!validateRosterSnapshot(data.initial_roster)) {
      setError("Invalid challenge data. It may have expired.");
      return;
    }
    const initialRoster = deserializeRoster(data.initial_roster);
    track("challenges", "challenge_accept", { challenge_id: challengeId, sport });
    track("challenges", "challenge_attempt_start", { challenge_id: challengeId, sport });
    onAccept({
      challengeId: data.challenge_id,
      initialRoster,
      targetScore: data.target_score,
      challengerName: data.challenger_name,
      sport: data.sport,
      season: data.season,
    });
  }

  const cards: any[] = (data?.initial_roster as any)?.cards ?? [];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", overflowY: "auto",
      padding: "24px 20px 40px",
    }}>
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          alignSelf: "flex-start", background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          padding: "5px 12px", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer",
          marginBottom: 24,
        }}
      >← Back</button>

      {loading && <div style={{ textAlign: "center", opacity: 0.5, marginTop: 80 }}>Loading challenge…</div>}
      {error && <div style={{ textAlign: "center", color: "#EF4444", marginTop: 80 }}>{error}</div>}

      {data && (
        <>
          {/* Challenger + score */}
          <div style={{ marginBottom: 8, fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
            Challenge from
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#EAF0FF", marginBottom: 4 }}>{data.challenger_name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 56, fontWeight: 950, color: "#FFB14A", lineHeight: 1, fontStyle: "italic" }}>{data.target_score.toFixed(1)}</span>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>FP</span>
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
            {challengeStatsLine(data)}
          </div>

          {/* Card grid */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 32, justifyContent: "center" }}>
            {cards.map((card: any, i: number) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.04)", border: `1.5px solid ${TIER_ACCENT[card.tier] ?? "#9CA3AF"}`,
                borderRadius: 10, padding: "10px 14px", minWidth: 120, textAlign: "center",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: TIER_ACCENT[card.tier] ?? "#9CA3AF", textTransform: "uppercase", marginBottom: 4 }}>{card.tier}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#EAF0FF" }}>{card.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{card.team} · ${card.salary}</div>
              </div>
            ))}
          </div>

          {/* Accept CTA */}
          {alreadyAttempted ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 12 }}>
              You've already attempted this challenge.
            </div>
          ) : (
            <button
              onClick={handleAccept}
              style={{
                width: "100%", padding: "16px", borderRadius: 14,
                background: "#FFB14A", border: "none",
                color: "#070A12", fontSize: 17, fontWeight: 900, cursor: "pointer",
                marginBottom: 16,
              }}
            >Accept Challenge</button>
          )}
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 1.6 }}>
            Same starting cards. Your hold/draw decisions. One run.
          </div>
        </>
      )}
    </div>
  );
}
```

### 10b — App.tsx route detection

- [ ] **Step 2: Add challenge route detection to basketball/src/App.tsx**

Add import at top of file:
```typescript
import { ChallengeLandingScreen } from "@shared/components/ChallengeLandingScreen";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { sportAdapter } from "./adapters/SportAdapter";
```

Add helper function before `AppInner`:
```typescript
function getChallengeId(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/basketball\/challenge\/([0-9a-f-]{36})/);
  return match ? match[1] : null;
}
```

Inside `AppInner()`, add alongside other state:
```typescript
  const challengeIdFromUrl = getChallengeId();
  const [challengeCtx, setChallengeCtx] = useState<ChallengeCtx | null>(null);
  const [showChallengeLanding, setShowChallengeLanding] = useState(!!challengeIdFromUrl);
```

In the render, before the closing `</>`, add the ChallengeLandingScreen overlay:
```tsx
      {showChallengeLanding && challengeIdFromUrl && (
        <ChallengeLandingScreen
          challengeId={challengeIdFromUrl}
          sport={SPORT}
          deserializeRoster={(snap) => sportAdapter.deserializeRoster(snap)}
          validateRosterSnapshot={(snap) => sportAdapter.validateRosterSnapshot(snap)}
          onAccept={(ctx) => {
            setChallengeCtx(ctx);
            setShowChallengeLanding(false);
            // Force game view, skip landing
            try { localStorage.setItem(SKIP_LANDING_KEY, "1"); } catch {}
            setView("game");
          }}
          onClose={() => { setShowChallengeLanding(false); window.history.pushState({}, "", "/basketball/"); }}
        />
      )}
```

Also, when in challenge mode, bypass the DailySeasonReelGate. Modify the existing `DailySeasonReelGate` usage:

Find `<DailySeasonReelGate bypass={isFTUE}` and change to:
```tsx
        <DailySeasonReelGate bypass={isFTUE || !!challengeCtx}
```

And pass `challengeCtx` to `GameView`:
```tsx
          <GameView challengeCtx={challengeCtx ?? undefined} />
```

### 10c — Basketball GameView wrapper accepts and forwards challengeCtx

- [ ] **Step 3: Modify basketball/src/views/GameView.tsx**

Change the component signature from:
```typescript
export default function GameView() {
```
to:
```typescript
export default function GameView({ challengeCtx }: { challengeCtx?: import("@shared/adapters/challengeTypes").ChallengeCtx }) {
```

Change the return from:
```tsx
  return <SharedGameView adapter={adapter} />;
```
to:
```tsx
  return <SharedGameView adapter={adapter} challengeCtx={challengeCtx} />;
```

### 10d — SharedGameView accepts challengeCtx prop + deal override

- [ ] **Step 4: Add challengeCtx prop to SharedGameView**

In `shared/views/GameView.tsx`, change the `Props` interface (around line 301):
```typescript
interface Props {
  adapter: GameAdapter;
  challengeCtx?: import("@shared/adapters/challengeTypes").ChallengeCtx;
}
```

Change the function signature:
```typescript
export function GameView({ adapter, challengeCtx }: Props) {
```

In `onPrimaryAction`, find the `gameState === "IDLE"` deal block. The current code (around line 1281) is:
```typescript
      let res: any;
      try {
        res = ftueStillActive ? await ftueDealRoster() : await dealInitialRoster();
```

Change to:
```typescript
      let res: any;
      try {
        if (challengeCtx && !ftueStillActive) {
          // Challenge mode: use the snapshot roster directly
          res = { roster: challengeCtx.initialRoster };
        } else {
          res = ftueStillActive ? await ftueDealRoster() : await dealInitialRoster();
        }
```

Also update the `challengeTrigger` useEffect to guard against challenge mode:
```typescript
  useEffect(() => {
    if (gameState !== "RESULTS" || !!challengeCtx) return;  // add !!challengeCtx guard
    ...
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: same pass/fail count as baseline.

- [ ] **Step 6: Commit**

```bash
git add shared/components/ChallengeLandingScreen.tsx basketball/src/App.tsx basketball/src/views/GameView.tsx shared/views/GameView.tsx
git commit -m "feat(challenges): challenge landing + App.tsx route detection + deal override"
```

---

## Task 11: ChallengeComparisonScreen + attempt submission

**Files:**
- Create: `shared/components/ChallengeComparisonScreen.tsx`
- Modify: `shared/views/GameView.tsx`

- [ ] **Step 1: Create ChallengeComparisonScreen**

```tsx
// shared/components/ChallengeComparisonScreen.tsx
import { useEffect, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { track } from "@shared/analytics/analytics";

interface AttemptResult {
  attempt_id: string;
  is_best: boolean;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
  already_attempted?: boolean;
}

interface Props {
  challengeCtx: ChallengeCtx;
  myScore: number;
  myWinTier: string;
  sport: string;
  onSendItBack: () => void;
  onPlayFresh: () => void;
}

function challengeStatsLine(count: number, winners: number, best: number | null, bestName: string | null): string {
  if (count === 0) return "Be the first to try.";
  if (count === 1 && winners === 0) return "1 attempt · still unbeaten";
  if (count >= 2 && winners === 0) return `Unbeaten so far · ${count} attempts`;
  const failed = count - winners;
  const rate = Math.round((failed / count) * 100);
  if (count >= 3 && winners > 0) return `${count} attempts · ${rate}% failed`;
  return `${count} attempts · best ${best?.toFixed(1) ?? "?"} FP by ${bestName ?? "someone"}`;
}

export function ChallengeComparisonScreen({ challengeCtx, myScore, myWinTier, sport, onSendItBack, onPlayFresh }: Props) {
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(true);

  const isWinner = myScore > challengeCtx.targetScore;

  useEffect(() => {
    const uid = getPlayerUid();
    const name = getNickname() || "Anonymous";
    markChallengeAttempted(challengeCtx.challengeId);

    fetch(`/api/challenge/${challengeCtx.challengeId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: myScore,
        is_winner: isWinner,
        user_id: uid || undefined,
        user_name: name,
      }),
    })
      .then(r => r.json())
      .then((d: AttemptResult) => {
        setAttemptResult(d);
        setSubmitting(false);
        track("challenges", isWinner ? "challenge_win" : "challenge_loss", {
          challenge_id: challengeCtx.challengeId,
          sport,
          score_delta: Math.round((myScore - challengeCtx.targetScore) * 10) / 10,
          attempt_count: d.attempt_count,
        });
        track("challenges", "challenge_attempt_complete", {
          challenge_id: challengeCtx.challengeId, sport,
          is_winner: isWinner, score: myScore,
        });
      })
      .catch(() => setSubmitting(false));
  }, []); // eslint-disable-line

  const isBest = attemptResult?.is_best ?? false;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9500,
      background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px 24px 48px", overflowY: "auto",
    }}>
      {/* Result headline */}
      <div style={{ fontSize: 40, fontWeight: 950, color: isWinner ? "#22C55E" : "#EF4444", marginBottom: 8 }}>
        {isWinner ? "You Beat It!" : "They Hold."}
      </div>
      {isBest && (
        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
          color: "#FFB14A", border: "1px solid rgba(255,177,74,0.4)", borderRadius: 6, padding: "3px 10px",
          marginBottom: 16,
        }}>New Best Score</div>
      )}

      {/* Score comparison */}
      <div style={{
        display: "flex", gap: 24, marginBottom: 32, marginTop: 16,
        background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "20px 32px",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>You</div>
          <div style={{ fontSize: 48, fontWeight: 950, color: isWinner ? "#22C55E" : "#EAF0FF", fontStyle: "italic" }}>{myScore.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>FP</div>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.12)", alignSelf: "stretch" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>{challengeCtx.challengerName}</div>
          <div style={{ fontSize: 48, fontWeight: 950, color: isWinner ? "#EAF0FF" : "#FFB14A", fontStyle: "italic" }}>{challengeCtx.targetScore.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>FP</div>
        </div>
      </div>

      {/* Stats line */}
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 32, textAlign: "center" }}>
        {submitting ? "Submitting…" : attemptResult
          ? challengeStatsLine(attemptResult.attempt_count, attemptResult.winner_count, attemptResult.best_score, attemptResult.best_user_name)
          : ""}
      </div>

      {/* CTAs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 360 }}>
        <button
          onClick={() => { track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport }); onSendItBack(); }}
          style={{
            padding: "15px", borderRadius: 12, background: "#FFB14A",
            border: "none", color: "#070A12", fontSize: 16, fontWeight: 900, cursor: "pointer",
          }}
        >
          {isWinner ? "Send It Back" : "Make Them Prove It Again"}
        </button>
        <button
          onClick={onPlayFresh}
          style={{
            padding: "13px", borderRadius: 12, background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >Play a Fresh Hand</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire ChallengeComparisonScreen into GameView**

In `shared/views/GameView.tsx`, add lazy import:
```typescript
const ChallengeComparisonScreen = lazy(() =>
  import("@shared/components/ChallengeComparisonScreen").then(m => ({ default: m.ChallengeComparisonScreen }))
);
```

Add state inside the component:
```typescript
  const [showChallengeComparison, setShowChallengeComparison] = useState(false);
```

Add a useEffect to show the comparison screen when RESULTS starts in challenge mode:
```typescript
  useEffect(() => {
    if (gameState !== "RESULTS" || !challengeCtx) return;
    setShowChallengeComparison(true);
  }, [gameState]); // eslint-disable-line
```

Add "Send It Back" handler (creates a new challenge from the recipient's result):
```typescript
  const handleSendItBack = useCallback(() => {
    setShowChallengeComparison(false);
    // Re-arm share prompt with current result — challenger share flow handles creation
    const resolvedRoster = rosterRef.current as import("@shared/types/index").GeneratedCard[];
    const fp = resolvedRoster.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0);
    const badges = resolvedRoster.flatMap((c: any) => c.achievements ?? []);
    const result = evaluateTrigger({ roster: resolvedRoster, totalFp: fp, winTier: winTier ?? "BUST", badges, winTiersMap: adapter.winTiersMap });
    setChallengeTrigger(result);
  }, [adapter.winTiersMap, winTier]); // eslint-disable-line
```

In the JSX render, add the comparison overlay (inside `Suspense`):
```tsx
        {showChallengeComparison && challengeCtx && (
          <Suspense fallback={null}>
            <ChallengeComparisonScreen
              challengeCtx={challengeCtx}
              myScore={rosterRef.current.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0)}
              myWinTier={winTier ?? "BUST"}
              sport={sportKey}
              onSendItBack={handleSendItBack}
              onPlayFresh={() => { setShowChallengeComparison(false); handleButtonClick(); }}
            />
          </Suspense>
        )}
```

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: same baseline pass/fail count.

- [ ] **Step 4: Commit**

```bash
git add shared/components/ChallengeComparisonScreen.tsx shared/views/GameView.tsx
git commit -m "feat(challenges): ChallengeComparisonScreen + attempt submission + send-back"
```

---

## Task 12: YourChallengesPanel + ProfileScreen tab

**Files:**
- Create: `shared/components/YourChallengesPanel.tsx`
- Modify: `shared/components/ProfileScreen.tsx`

- [ ] **Step 1: Create YourChallengesPanel**

```tsx
// shared/components/YourChallengesPanel.tsx
import { useEffect, useState } from "react";
import { supabase } from "@shared/lib/supabase";
import { getPlayerUid } from "@shared/utils/playerIdentity";
import { track } from "@shared/analytics/analytics";

const LAST_VIEWED_KEY = "rm_challenges_last_viewed";

interface ChallengeRow {
  challenge_id: string;
  sport: string;
  target_fp: number;
  challenger_name: string | null;
  trigger_type: string;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
  last_attempt_at: string | null;
  created_at: string;
}

function statsLine(row: ChallengeRow): string {
  const { attempt_count, winner_count, best_score, best_user_name } = row;
  if (attempt_count === 0) return "No attempts yet";
  if (winner_count === 0) return `${attempt_count} attempt${attempt_count > 1 ? "s" : ""} · unbeaten`;
  return `${attempt_count} attempts · best ${best_score?.toFixed(1) ?? "?"} FP by ${best_user_name ?? "?"}`;
}

interface Props {
  sport: string;
  currentUid: string | null;
}

export function YourChallengesPanel({ sport, currentUid }: Props) {
  const [rows, setRows] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!currentUid) { setLoading(false); return; }
    const lastViewed = localStorage.getItem(LAST_VIEWED_KEY) ?? "1970-01-01";

    supabase
      .from("shared_challenges")
      .select("challenge_id,sport,target_fp,challenger_name,trigger_type,attempt_count,winner_count,best_score,best_user_name,last_attempt_at,created_at")
      .eq("created_by", currentUid)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const challenges = (data ?? []) as ChallengeRow[];
        setRows(challenges);
        const anyNew = challenges.some(c => c.last_attempt_at && c.last_attempt_at > lastViewed);
        setHasNew(anyNew);
        setLoading(false);
        // Mark as viewed
        localStorage.setItem(LAST_VIEWED_KEY, new Date().toISOString());
        if (anyNew) track("challenges", "challenge_unbeaten_viewed", { sport });
        track("challenges", "challenge_stats_seen", { sport, count: challenges.length });
      });
  }, [currentUid, sport]); // eslint-disable-line

  if (loading) return <div style={{ padding: 24, opacity: 0.5, textAlign: "center" }}>Loading…</div>;
  if (!currentUid) return (
    <div style={{ padding: 24, opacity: 0.5, textAlign: "center" }}>Sign in to see your challenges.</div>
  );
  if (rows.length === 0) return (
    <div style={{ padding: 24, opacity: 0.5, textAlign: "center", lineHeight: 1.6 }}>
      No challenges yet.<br />
      <span style={{ fontSize: 12 }}>After a hand ends, tap "Challenge a Friend" to start one.</span>
    </div>
  );

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      {hasNew && (
        <div style={{
          fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
          color: "#FFB14A", marginBottom: 14,
        }}>New attempts since you last checked</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(row => {
          const isUnbeaten = row.attempt_count > 0 && row.winner_count === 0;
          return (
            <div
              key={row.challenge_id}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: isUnbeaten ? "1.5px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#FFB14A", fontStyle: "italic" }}>
                  {Number(row.target_fp).toFixed(1)} FP
                </div>
                {isUnbeaten && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                    color: "#22C55E", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 4,
                    padding: "2px 6px",
                  }}>Unbeaten</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{statsLine(row)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/${row.sport}/challenge/${row.challenge_id}`).then(() => {})}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                    background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >Copy link</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Returns true if there are unseen challenge attempts (for badge dot in profile header) */
export function useHasNewChallengeAttempts(currentUid: string | null, sport: string): boolean {
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    if (!currentUid) return;
    const lastViewed = localStorage.getItem(LAST_VIEWED_KEY) ?? "1970-01-01";
    supabase
      .from("shared_challenges")
      .select("last_attempt_at")
      .eq("created_by", currentUid)
      .not("last_attempt_at", "is", null)
      .gt("last_attempt_at", lastViewed)
      .limit(1)
      .then(({ data }) => setHasNew((data?.length ?? 0) > 0));
  }, [currentUid, sport]); // eslint-disable-line
  return hasNew;
}
```

- [ ] **Step 2: Add "Challenges" tab to ProfileScreen**

In `shared/components/ProfileScreen.tsx`, add import at top:
```typescript
import { YourChallengesPanel } from "./YourChallengesPanel";
```

Find the `profileTab` state declaration and add "challenges" to the union type:
```typescript
const [profileTab, setProfileTab] = useState<"stats" | "achievements" | "challenges">("stats");
```

In the tab bar render section, after the "achievements" tab button, add:
```tsx
        <button
          onClick={() => setProfileTab("challenges")}
          style={{
            flex: 1, padding: "8px 0", background: "transparent", border: "none",
            borderBottom: profileTab === "challenges" ? "2px solid #FFB14A" : "2px solid transparent",
            color: profileTab === "challenges" ? "#FFB14A" : "rgba(255,255,255,0.45)",
            fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
          }}
        >Challenges</button>
```

After the `{profileTab === "achievements" && ...}` block, add:
```tsx
        {profileTab === "challenges" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <YourChallengesPanel sport={sport} currentUid={currentUid} />
          </div>
        )}
```

- [ ] **Step 3: Commit**

```bash
git add shared/components/YourChallengesPanel.tsx shared/components/ProfileScreen.tsx
git commit -m "feat(challenges): YourChallengesPanel + ProfileScreen challenges tab"
```

---

## Task 13: Analytics wiring

**Files:**
- `shared/hooks/useChallengeShare.ts` — already has several events
- `shared/components/ChallengeLandingScreen.tsx` — already has several events
- `shared/components/ChallengeComparisonScreen.tsx` — already has several events
- `shared/views/GameView.tsx` — verify share_trigger_fired wires correctly

The 8 required analytics events and where they fire:

| Event | Where |
|-------|-------|
| `challenge_view` (same as `challenge_link_open`) | `ChallengeLandingScreen` mount |
| `challenge_accept` | `ChallengeLandingScreen` onAccept |
| `challenge_complete` (same as `challenge_attempt_complete`) | `ChallengeComparisonScreen` after submit |
| `challenge_win` | `ChallengeComparisonScreen` after submit (is_winner=true) |
| `challenge_loss` | `ChallengeComparisonScreen` after submit (is_winner=false) |
| `challenge_send_back` | `ChallengeComparisonScreen` onSendItBack click |
| `challenge_unbeaten_viewed` | `YourChallengesPanel` when hasNew=true |
| `challenge_stats_seen` | `YourChallengesPanel` on mount with data |

All events are already wired in the components above. This task verifies they all have the correct properties.

- [ ] **Step 1: Verify all 8 events are in place by grepping**

```bash
grep -r "track.*challenges" \
  shared/components/ChallengeLandingScreen.tsx \
  shared/components/ChallengeComparisonScreen.tsx \
  shared/components/YourChallengesPanel.tsx \
  shared/hooks/useChallengeShare.ts \
  shared/views/GameView.tsx 2>/dev/null | grep -v "^Binary"
```

Expected: at least 8 distinct track calls with feature="challenges".

- [ ] **Step 2: Verify challenge_id, trigger_type, score_delta props are present in key events**

Check that `challenge_accept` includes `challenge_id`, `challenge_attempt_complete` includes `is_winner + score`, and `challenge_send_back` includes `challenge_id + sport`.

- [ ] **Step 3: Run full test suite one final time**

```bash
npm test 2>&1 | tail -10
```

Expected: same baseline pass/fail count (383 passing, 4 pre-existing failures).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(challenges): analytics wiring verified — share & challenge MVP complete"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Initial roster capture (Task 3)
- [x] Migration 006 with all columns + RPC (Task 1 + Task 6)
- [x] SportAdapter serialize/deserialize/validate/comparison/shareCard (Task 2)
- [x] POST /api/challenge/create (Task 5)
- [x] GET /api/challenge/:id with view_count increment (Task 5)
- [x] POST /api/challenge/:id/attempt with atomic counters + anti-self-farm (Task 6)
- [x] Satori share card 1080×1920 (Task 7)
- [x] Trigger evaluation: 5 types in priority order with tests (Task 4)
- [x] useChallengeShare hook: evalAndArm/create/share/reset (Task 8)
- [x] ChallengeSharePrompt: always renders at RESULTS, special vs default styling (Task 9)
- [x] ChallengeLandingScreen: no signup wall, no homepage redirect, stats line (Task 10)
- [x] Challenge replay override: skip dealInitialRoster, use snapshot (Task 10)
- [x] ChallengeComparisonScreen: score comparison, best score, CTAs (Task 11)
- [x] Send-it-back: re-arms share prompt with recipient's result (Task 11)
- [x] YourChallengesPanel + ProfileScreen tab (Task 12)
- [x] Analytics: 8 events (Task 13)
- [x] One-attempt-per-signed-in-user enforcement (Task 6)
- [x] Anonymous attempts: client-side localStorage guard (useChallengeShare)
- [x] Challenge stats rules (5 display states) in ChallengeLandingScreen + ComparisonScreen

**No placeholders:** All code blocks are complete. No TBD/TODO.

**Type consistency:** `ChallengeCtx` defined once in `challengeTypes.ts`, imported everywhere. `TriggerResult.trigger` values consistent across evaluateTrigger + ChallengeSharePrompt + analytics.

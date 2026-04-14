# Unified Commentary Engine — Part 1: Types, Archetypes & Classification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-story system with a 13-archetype system backed by a canonical `CommentaryContext` object and deterministic classification.

**Architecture:** Expand `types.ts` with new types, create `archetypes.ts` as the master list, create `classifyArchetype.ts` as a pure deterministic classifier, create `priorities.ts` for narrative priority rules. All existing systems (tone, badges, extremes, records) feed INTO archetype classification — archetype is king.

**Tech Stack:** TypeScript, no external deps. Pure functions. localStorage for anti-repeat state.

---

## Initial 13 Archetypes

Mapping from current 9 `StoryId` values to new `CommentaryArchetype`:

| # | Archetype | Old StoryId(s) | When it fires |
|---|-----------|---------------|---------------|
| 1 | `star_carry` | star_went_off | Star ratio ≥1.35, win |
| 2 | `star_carry_big` | star_went_off (high tier) | Star ratio ≥1.35, win, tier ≥ ALL_STAR |
| 3 | `star_delivered` | star_delivered | Star ratio ≥1.0 & <1.35, win |
| 4 | `balanced_win` | clean_win, star_quiet_win | No star OR star ratio <1.0, win |
| 5 | `badge_explosion` | star_rare_badge | Multi-stat badge tier 1-2, win |
| 6 | `near_miss` | (new — was detail only) | Loss, gap to ROOKIE ≤ 5 FP |
| 7 | `star_failed` | star_no_showed | Star ratio <0.65, loss |
| 8 | `star_cold` | star_cold | Star ratio 0.65-0.75, loss |
| 9 | `star_carried_loss` | star_carried_loss | Star ratio ≥1.35, loss |
| 10 | `everyone_flat` | everyone_flat | No star OR star ratio 0.75-1.0, loss |
| 11 | `ugly_win` | (new) | Win but star ratio <0.8 AND tier = ROOKIE |
| 12 | `collapse` | (new) | Loss, prev streak ≥ 3 AND gap > 15 |
| 13 | `career_night` | (new — was detail only) | Tier 1 extreme game flag on star |

**Schema supports but not yet active (future):** `streak_first`, `streak_milestone`, `streak_broken`, `hold_rewarded`, `draw_rewarded`, `smart_hold_star`, `smart_hold_role_player`, `painful_near_miss`, `anchor_underperformed`, `one_player_threw`, `outlier_bench_hero`, `ice_cold`, `lucky_escape`, `comfortable_win`, `dominant_win`, `goat_clinch`, `mvp_clinch`, `bust_result`, `high_score_low_reward`, `wrong_star_wrong_night`, `clutch_finish`, `overperformance_shock`, `underperformance_shock`.

---

## Classification Priority Chain (deterministic, no scoring)

```
1. career_night     — Tier 1 extreme flag on star, any register
2. badge_explosion  — Multi-stat badge tier 1-2 on star, any register
3. near_miss        — Loss, gap to ROOKIE ≤ 5 FP
4. collapse         — Loss, prevStreak ≥ 3, gap > 15
5. star_carry_big   — Win, star ratio ≥ 1.35, tier ≥ ALL_STAR
6. star_carry       — Win, star ratio ≥ 1.35
7. star_carried_loss — Loss, star ratio ≥ 1.35
8. star_failed      — Loss, star ratio < 0.65
9. star_cold        — Loss, star ratio 0.65–0.75
10. ugly_win        — Win, star ratio < 0.8, tier = ROOKIE
11. star_delivered  — Win, star ratio ≥ 1.0
12. everyone_flat   — Loss (fallthrough)
13. balanced_win    — Win (fallthrough)
```

First match wins. Exactly one archetype per hand. No blending.

---

### Task 1: Expand types.ts with new type definitions

**Files:**
- Modify: `shared/commentary/types.ts`

- [ ] **Step 1: Add CommentaryArchetype type**

Add after the existing `StoryId` type (keep StoryId for backward compat):

```ts
/** Master archetype system — exactly one per hand. Schema supports 32, ~13 active. */
export type CommentaryArchetype =
  // ── Active (populated with lines) ──
  | "star_carry"
  | "star_carry_big"
  | "star_delivered"
  | "balanced_win"
  | "badge_explosion"
  | "near_miss"
  | "star_failed"
  | "star_cold"
  | "star_carried_loss"
  | "everyone_flat"
  | "ugly_win"
  | "collapse"
  | "career_night"
  // ── Reserved (schema only, no lines yet) ──
  | "streak_first"
  | "streak_milestone"
  | "streak_broken"
  | "hold_rewarded"
  | "draw_rewarded"
  | "smart_hold_star"
  | "smart_hold_role_player"
  | "painful_near_miss"
  | "anchor_underperformed"
  | "one_player_threw"
  | "outlier_bench_hero"
  | "ice_cold"
  | "lucky_escape"
  | "comfortable_win"
  | "dominant_win"
  | "goat_clinch"
  | "mvp_clinch"
  | "bust_result"
  | "high_score_low_reward"
  | "wrong_star_wrong_night"
  | "clutch_finish"
  | "overperformance_shock"
  | "underperformance_shock";
```

- [ ] **Step 2: Add CommentaryContext type**

This is the canonical input object. Add after CommentaryArchetype:

```ts
/** Canonical input to the runtime commentary selector. Built once per hand. */
export interface CommentaryContext {
  sport: string;
  register: Register;
  archetype: CommentaryArchetype;
  intensity: Intensity;
  tone: ToneId;

  totalFp: number;
  tierReached: WinTier;
  deltaToNextTier: number;
  nearMiss: boolean;

  star: CommentaryRosterCard | null;
  starRatio: number;
  culprit: CommentaryRosterCard | null;

  highestBadge: import("./badgeTiers").BadgeTierInfo & { id: string } | null;
  hasTier1Extreme: boolean;

  streak: number;
  prevStreak: number;

  seed: number;

  /** Pre-built template data for token resolution */
  templateData: TemplateData;
  /** Detail IDs from story assembly */
  details: DetailId[];
  recordEvents: RecordEvent[];
}
```

- [ ] **Step 3: Add CommentaryLine type**

This is the normalized line library schema:

```ts
/** Single line in the commentary library. Grouped by archetype. */
export interface CommentaryLine {
  id: string;
  sport: "any" | "basketball" | "baseball";
  archetype: CommentaryArchetype;
  register: Register;
  tone: ToneId;
  intensity?: Intensity[];
  template: string;
  /** Tokens this template requires to be non-empty */
  requires?: string[];
  /** Context flags that must NOT be present */
  forbids?: string[];
  tags?: string[];
  humorStyle?: string[];
  qualityScore?: number;
  enabled: boolean;
}

/** Grouped library format — archetypes are top-level keys */
export interface CommentaryLibrary {
  [archetype: string]: CommentaryLine[];
}
```

- [ ] **Step 4: Add CommentaryResult type**

```ts
/** Output of the runtime selector */
export interface CommentaryResult {
  mainLine: string;
  subLine?: string | null;
  stamp?: string | null;
  archetype: CommentaryArchetype;
  tone: ToneId;
  lineId: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add shared/commentary/types.ts
git commit -m "feat(commentary): add CommentaryArchetype, CommentaryContext, CommentaryLine, CommentaryResult types"
```

---

### Task 2: Create archetypes.ts — master archetype registry

**Files:**
- Create: `shared/commentary/archetypes.ts`

- [ ] **Step 1: Create the archetype metadata registry**

```ts
/**
 * archetypes.ts — Master archetype registry.
 * Maps each archetype to metadata: which register it belongs to,
 * whether it's active (has lines), and fallback archetype if no lines match.
 */

import type { CommentaryArchetype, Register } from "./types";

export interface ArchetypeMeta {
  register: Register | "any";
  active: boolean;
  /** Fallback if no lines found for this archetype + tone combo */
  fallback: CommentaryArchetype | null;
  /** Old StoryId(s) this replaces — for migration reference */
  legacyStoryIds: string[];
}

export const ARCHETYPE_REGISTRY: Record<CommentaryArchetype, ArchetypeMeta> = {
  // ── Active win archetypes ──
  star_carry:       { register: "win",  active: true,  fallback: "star_delivered",   legacyStoryIds: ["star_went_off"] },
  star_carry_big:   { register: "win",  active: true,  fallback: "star_carry",       legacyStoryIds: ["star_went_off"] },
  star_delivered:   { register: "win",  active: true,  fallback: "balanced_win",     legacyStoryIds: ["star_delivered"] },
  balanced_win:     { register: "win",  active: true,  fallback: null,               legacyStoryIds: ["clean_win", "star_quiet_win"] },
  badge_explosion:  { register: "any",  active: true,  fallback: "star_carry",       legacyStoryIds: ["star_rare_badge"] },
  ugly_win:         { register: "win",  active: true,  fallback: "balanced_win",     legacyStoryIds: [] },
  career_night:     { register: "any",  active: true,  fallback: "star_carry",       legacyStoryIds: [] },

  // ── Active loss archetypes ──
  near_miss:        { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: [] },
  star_failed:      { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: ["star_no_showed"] },
  star_cold:        { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: ["star_cold"] },
  star_carried_loss:{ register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: ["star_carried_loss"] },
  everyone_flat:    { register: "loss", active: true,  fallback: null,               legacyStoryIds: ["everyone_flat"] },
  collapse:         { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: [] },

  // ── Reserved (inactive) ──
  streak_first:           { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  streak_milestone:       { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  streak_broken:          { register: "loss", active: false, fallback: "everyone_flat",    legacyStoryIds: [] },
  hold_rewarded:          { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  draw_rewarded:          { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  smart_hold_star:        { register: "win",  active: false, fallback: "star_carry",       legacyStoryIds: [] },
  smart_hold_role_player: { register: "win",  active: false, fallback: "balanced_win",     legacyStoryIds: [] },
  painful_near_miss:      { register: "loss", active: false, fallback: "near_miss",        legacyStoryIds: [] },
  anchor_underperformed:  { register: "loss", active: false, fallback: "star_failed",      legacyStoryIds: [] },
  one_player_threw:       { register: "loss", active: false, fallback: "star_failed",      legacyStoryIds: [] },
  outlier_bench_hero:     { register: "win",  active: false, fallback: "balanced_win",     legacyStoryIds: [] },
  ice_cold:               { register: "loss", active: false, fallback: "star_cold",        legacyStoryIds: [] },
  lucky_escape:           { register: "win",  active: false, fallback: "ugly_win",         legacyStoryIds: [] },
  comfortable_win:        { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  dominant_win:           { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  goat_clinch:            { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  mvp_clinch:             { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  bust_result:            { register: "loss", active: false, fallback: "everyone_flat",    legacyStoryIds: [] },
  high_score_low_reward:  { register: "win",  active: false, fallback: "ugly_win",         legacyStoryIds: [] },
  wrong_star_wrong_night: { register: "loss", active: false, fallback: "star_cold",        legacyStoryIds: [] },
  clutch_finish:          { register: "win",  active: false, fallback: "star_carry",       legacyStoryIds: [] },
  overperformance_shock:  { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  underperformance_shock: { register: "loss", active: false, fallback: "star_failed",      legacyStoryIds: [] },
};

/** Get active archetypes only */
export function getActiveArchetypes(): CommentaryArchetype[] {
  return (Object.entries(ARCHETYPE_REGISTRY) as [CommentaryArchetype, ArchetypeMeta][])
    .filter(([, meta]) => meta.active)
    .map(([id]) => id);
}

/** Get fallback chain for an archetype (max 3 hops) */
export function getFallbackChain(archetype: CommentaryArchetype): CommentaryArchetype[] {
  const chain: CommentaryArchetype[] = [archetype];
  let current = archetype;
  for (let i = 0; i < 3; i++) {
    const fb = ARCHETYPE_REGISTRY[current]?.fallback;
    if (!fb || chain.includes(fb)) break;
    chain.push(fb);
    current = fb;
  }
  return chain;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/archetypes.ts
git commit -m "feat(commentary): add archetype registry with 13 active + 19 reserved archetypes"
```

---

### Task 3: Create classifyArchetype.ts — deterministic classifier

**Files:**
- Create: `shared/commentary/classifyArchetype.ts`

- [ ] **Step 1: Create the classifier**

```ts
/**
 * classifyArchetype.ts — Deterministic archetype classification.
 *
 * Priority chain: first match wins, exactly one archetype per hand.
 * No scoring, no blending, no probabilistic logic.
 * Archetype classification takes precedence over all other systems.
 */

import type {
  CommentaryArchetype,
  Register,
  CommentaryInput,
  CommentaryRosterCard,
  WinTier,
} from "./types";
import type { BadgeTierInfo } from "./badgeTiers";
import { getHighestBadge, isRareBadge } from "./badgeTiers";
import { selectStar } from "./storySelector";

// ── Helpers ────────────────────────────────────────────────────────────────

function ratio(c: CommentaryRosterCard): number {
  const p = Number(c.projectedFp ?? 0);
  return p > 0 ? c.actualFp / p : 1;
}

function hasTier1Extreme(roster: CommentaryRosterCard[]): boolean {
  return roster.some(c => c.extremeFlags?.some(f => f.tier === 1));
}

function getStarBadge(star: CommentaryRosterCard | null): (BadgeTierInfo & { id: string }) | null {
  if (!star) return null;
  const ids = (star.achievements ?? []).map(a => a.id);
  return getHighestBadge(ids);
}

const HIGH_TIERS: Set<WinTier> = new Set(["ALL_STAR", "MVP", "LEGEND"]);

// ── Classification ─────────────────────────────────────────────────────────

export interface ClassificationResult {
  archetype: CommentaryArchetype;
  star: CommentaryRosterCard | null;
  starRatio: number;
  highestBadge: (BadgeTierInfo & { id: string }) | null;
  hasTier1Extreme: boolean;
  nearMiss: boolean;
  deltaToNextTier: number;
}

/**
 * Classify a hand into exactly one archetype.
 * Priority chain — first match wins. No scoring, no blending.
 */
export function classifyArchetype(input: CommentaryInput): ClassificationResult {
  const register: Register = input.isBust ? "loss" : "win";
  const star = selectStar(input.roster);
  const r = star ? ratio(star) : 1.0;
  const badge = getStarBadge(star);
  const hasExtreme = hasTier1Extreme(input.roster);
  const gap = (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 999;
  const nearMiss = input.isBust && gap > 0 && gap <= 5;

  const base = {
    star,
    starRatio: r,
    highestBadge: badge,
    hasTier1Extreme: hasExtreme,
    nearMiss,
    deltaToNextTier: gap,
  };

  // ── Priority 1: Career night (tier 1 extreme on star) ──
  if (hasExtreme && star?.extremeFlags?.some(f => f.tier === 1)) {
    return { ...base, archetype: "career_night" };
  }

  // ── Priority 2: Badge explosion (multi-stat badge tier 1-2) ──
  if (badge && isRareBadge(badge.tier) && badge.multiStat === true) {
    return { ...base, archetype: "badge_explosion" };
  }

  // ── Priority 3: Near miss (loss, ≤5 FP from ROOKIE) ──
  if (nearMiss) {
    return { ...base, archetype: "near_miss" };
  }

  // ── Priority 4: Collapse (loss, streak broken, blown out) ──
  if (register === "loss" && input.prevStreak >= 3 && gap > 15) {
    return { ...base, archetype: "collapse" };
  }

  // ── Priority 5-6: Star carry wins ──
  if (register === "win" && r >= 1.35) {
    if (HIGH_TIERS.has(input.winTier)) {
      return { ...base, archetype: "star_carry_big" };
    }
    return { ...base, archetype: "star_carry" };
  }

  // ── Priority 7: Star carried loss ──
  if (register === "loss" && r >= 1.35) {
    return { ...base, archetype: "star_carried_loss" };
  }

  // ── Priority 8: Star failed (no-show) ──
  if (register === "loss" && r < 0.65) {
    return { ...base, archetype: "star_failed" };
  }

  // ── Priority 9: Star cold ──
  if (register === "loss" && r < 0.75) {
    return { ...base, archetype: "star_cold" };
  }

  // ── Priority 10: Ugly win ──
  if (register === "win" && r < 0.8 && input.winTier === "ROOKIE") {
    return { ...base, archetype: "ugly_win" };
  }

  // ── Priority 11: Star delivered ──
  if (register === "win" && r >= 1.0) {
    return { ...base, archetype: "star_delivered" };
  }

  // ── Fallthrough ──
  if (register === "loss") {
    return { ...base, archetype: "everyone_flat" };
  }
  return { ...base, archetype: "balanced_win" };
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/classifyArchetype.ts
git commit -m "feat(commentary): deterministic archetype classifier with priority chain"
```

---

### Task 4: Create priorities.ts — narrative priority documentation

**Files:**
- Create: `shared/commentary/priorities.ts`

- [ ] **Step 1: Create the priorities module**

```ts
/**
 * priorities.ts — Narrative priority rules.
 *
 * These rules are ENFORCED by classifyArchetype.ts (the priority chain).
 * This file documents them explicitly and provides detail-assembly priority
 * for the sub-line / stamp system.
 *
 * CORE RULE: Archetype classification takes precedence over all other systems.
 * Tone is secondary. Culture is flavor. Badges feed classification, not vice versa.
 */

import type { DetailId } from "./types";

/**
 * Win detail priority — which details get assembled into sub-lines.
 * Higher priority = assembled first. Max 2 details per hand.
 */
export const WIN_DETAIL_PRIORITY: DetailId[] = [
  "record_event",      // Record broken always leads
  "rare_badge",        // Tier 1-2 badge always mentioned
  "extreme_game",      // Tier 1 extreme always mentioned
  "near_miss_win",     // Close to next tier
  "high_stats",        // Notable stat line
  "common_badge",      // Solid badge
  "streak_event",      // Streak milestone
  "streak_proximity",  // Close to next streak tier
  "culture_hit",       // Culture flavor
  "held_card_paid",    // Hold validation
];

/**
 * Loss detail priority — same structure, loss-specific.
 */
export const LOSS_DETAIL_PRIORITY: DetailId[] = [
  "record_event",
  "rare_badge",
  "extreme_game",
  "zero_card",
  "streak_broken",
  "near_miss_loss",
  "turnover_problem",
  "culture_loss",
  "injury_cost",
];

/**
 * Stamps — only fire for truly extraordinary moments.
 * These are separate from the main line. Optional UI treatment.
 */
export type Stamp = "CAREER NIGHT" | "ICE COLD" | "BAD BEAT" | "STREAK BROKEN" | "HISTORIC";

export function selectStamp(
  archetype: string,
  gap: number,
  prevStreak: number,
): Stamp | null {
  if (archetype === "career_night") return "CAREER NIGHT";
  if (archetype === "near_miss" && gap <= 2) return "BAD BEAT";
  if (archetype === "collapse" && prevStreak >= 5) return "STREAK BROKEN";
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/priorities.ts
git commit -m "feat(commentary): narrative priority rules and stamp system"
```

---

### Task 5: Create tests for archetype classification

**Files:**
- Create: `shared/commentary/__tests__/classifyArchetype.test.ts`

- [ ] **Step 1: Write classification tests**

```ts
import { classifyArchetype } from "../classifyArchetype";
import type { CommentaryInput, CommentaryRosterCard } from "../types";

function makeCard(overrides: Partial<CommentaryRosterCard> = {}): CommentaryRosterCard {
  return {
    name: "Test Player",
    salary: 50,
    actualFp: 40,
    projectedFp: 30,
    cardTier: "ORANGE",
    statLine: { pts: 30, reb: 8, ast: 5, stl: 1, blk: 1, turnovers: 2 },
    achievements: [],
    extremeFlags: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<CommentaryInput> = {}): CommentaryInput {
  return {
    sport: "basketball",
    totalFp: 200,
    winTier: "STARTER",
    nextTier: "ALL_STAR",
    tierFloor: 168,
    nextTierMin: 188,
    streak: 0,
    prevStreak: 0,
    isBust: false,
    handCount: 1,
    roster: [makeCard()],
    ...overrides,
  };
}

describe("classifyArchetype", () => {
  test("career_night fires for tier 1 extreme on star", () => {
    const card = makeCard({
      extremeFlags: [{ type: "god_mode_pts", tier: 1, priority: 100, headline: "50+ pts", keyStat: "pts", value: 55 }],
    });
    const result = classifyArchetype(makeInput({ roster: [card] }));
    expect(result.archetype).toBe("career_night");
  });

  test("badge_explosion fires for multi-stat rare badge", () => {
    const card = makeCard({
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    const result = classifyArchetype(makeInput({ roster: [card] }));
    expect(result.archetype).toBe("badge_explosion");
  });

  test("near_miss fires for loss within 5 FP of ROOKIE", () => {
    const result = classifyArchetype(makeInput({
      isBust: true,
      totalFp: 145,
      nextTierMin: 148,
      winTier: "BUST",
    }));
    expect(result.archetype).toBe("near_miss");
    expect(result.nearMiss).toBe(true);
  });

  test("collapse fires for loss after streak with big gap", () => {
    const result = classifyArchetype(makeInput({
      isBust: true,
      totalFp: 120,
      nextTierMin: 148,
      prevStreak: 4,
      winTier: "BUST",
    }));
    expect(result.archetype).toBe("collapse");
  });

  test("star_carry_big fires for high-ratio win at high tier", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      winTier: "ALL_STAR",
    }));
    expect(result.archetype).toBe("star_carry_big");
  });

  test("star_carry fires for high-ratio win at low tier", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      winTier: "STARTER",
    }));
    expect(result.archetype).toBe("star_carry");
  });

  test("star_carried_loss fires for high-ratio loss", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
    }));
    expect(result.archetype).toBe("star_carried_loss");
  });

  test("star_failed fires for very low ratio loss", () => {
    const card = makeCard({ actualFp: 15, projectedFp: 40 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
      totalFp: 100,
      nextTierMin: 148,
    }));
    expect(result.archetype).toBe("star_failed");
  });

  test("star_cold fires for moderate underperformance loss", () => {
    const card = makeCard({ actualFp: 22, projectedFp: 30 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
      totalFp: 130,
      nextTierMin: 148,
    }));
    expect(result.archetype).toBe("star_cold");
  });

  test("ugly_win fires for low-ratio ROOKIE win", () => {
    const card = makeCard({ actualFp: 20, projectedFp: 30 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      winTier: "ROOKIE",
    }));
    expect(result.archetype).toBe("ugly_win");
  });

  test("star_delivered fires for solid ratio win", () => {
    const card = makeCard({ actualFp: 35, projectedFp: 30 });
    const result = classifyArchetype(makeInput({ roster: [card] }));
    expect(result.archetype).toBe("star_delivered");
  });

  test("everyone_flat is loss fallthrough", () => {
    const card = makeCard({ actualFp: 25, projectedFp: 30 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
      totalFp: 130,
      nextTierMin: 148,
    }));
    expect(result.archetype).toBe("everyone_flat");
  });

  test("balanced_win is win fallthrough", () => {
    const card = makeCard({ actualFp: 25, projectedFp: 30 });
    const result = classifyArchetype(makeInput({ roster: [card] }));
    expect(result.archetype).toBe("balanced_win");
  });

  test("career_night takes priority over badge_explosion", () => {
    const card = makeCard({
      extremeFlags: [{ type: "god_mode_pts", tier: 1, priority: 100, headline: "50+", keyStat: "pts", value: 55 }],
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    const result = classifyArchetype(makeInput({ roster: [card] }));
    expect(result.archetype).toBe("career_night");
  });

  test("returns exactly one archetype (deterministic)", () => {
    const card = makeCard({ actualFp: 50, projectedFp: 30 });
    const r1 = classifyArchetype(makeInput({ roster: [card] }));
    const r2 = classifyArchetype(makeInput({ roster: [card] }));
    expect(r1.archetype).toBe(r2.archetype);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/john/Desktop/ReplayMod && npx vitest run shared/commentary/__tests__/classifyArchetype.test.ts
```

Expected: All 13 tests pass.

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/__tests__/classifyArchetype.test.ts
git commit -m "test(commentary): archetype classification tests covering all 13 active archetypes"
```

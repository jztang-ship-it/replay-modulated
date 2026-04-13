# Commentary System Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-line commentary system with a unified, star-first, tone-varied message composer with a scenario test harness for self-improving quality.

**Architecture:** Sport-agnostic composer pipeline (register → intensity → star → story → tone → compose) with structured template bank keyed by `(register, story, tone)`. Session-aware tone engine prevents redundancy. Scenario harness grades outputs and rejects bad templates.

**Tech Stack:** TypeScript, Vite/React (existing), localStorage for tone history, `npx tsx` for CLI audit tool.

**Spec:** `docs/superpowers/specs/2026-04-13-commentary-system-rewrite-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `shared/commentary/types.ts` | Modify | Add `CommentaryTemplate`, `ToneId`, `StoryId`, `Register`, `Intensity`, `RecordEvent` types |
| `shared/commentary/toneEngine.ts` | Create | Weighted random tone selection with session-aware anti-redundancy |
| `shared/data/nbaRecords.ts` | Create | Static NBA single-game records + career milestone thresholds |
| `shared/data/recordDetector.ts` | Create | Compare stat line against records, return `RecordEvent[]` |
| `shared/commentary/storySelector.ts` | Create | Star-first story selection + probabilistic detail assembly |
| `shared/commentary/templateBank.ts` | Create | Template registry loader, sport-keyed lookup |
| `shared/commentary/templateBank.basketball.ts` | Create | Basketball templates keyed by (register, story, tone) |
| `shared/commentary/templateResolver.ts` | Create | Token resolution ({name}, {last}, {nick}, etc.) + detail injection + char cap |
| `shared/commentary/composeCommentary.ts` | Create | Unified composer orchestrating Steps 1-6 |
| `basketball/src/views/GameView.tsx` | Modify | Feature flag to switch between old and new system |
| `basketball/src/tools/commentaryAudit.ts` | Create | Scenario generator + rule-based grader + report |

---

### Task 1: Types

**Files:**
- Modify: `shared/commentary/types.ts`

- [ ] **Step 1: Add `sport` to existing CommentaryInput and PostRevealCopyInput**

First, add `sport: string` to the `CommentaryInput` interface (around line 33) and to `PostRevealCopyInput` in `basketball/src/utils/buildPostRevealCopy.ts` (around line 26). This lets the composer route to sport-specific template banks.

```typescript
// In CommentaryInput (types.ts) — add after "sport: string" (already exists)
// In PostRevealCopyInput (buildPostRevealCopy.ts) — add:
sport?: string;
```

- [ ] **Step 2: Add new types to types.ts**

Add after the existing `CommentaryOutput` interface (line 87):

```typescript
// ─── New commentary system types ─────────────────────────────────────────────

export type ToneId = "hype" | "warm" | "culture_wry" | "observational" | "analytical" | "deadpan";

export type StoryId =
  // Win stories
  | "star_went_off"      // ratio >= 1.35
  | "star_delivered"     // ratio 1.0-1.35
  | "star_quiet_win"     // ratio 0.75-1.0 but team won
  | "clean_win"          // fallback — no nameable star
  // Loss stories
  | "star_no_showed"     // ratio < 0.75
  | "star_cold"          // ratio 0.65-0.75
  | "everyone_flat";     // fallback — no single culprit

export type Register = "win" | "loss";

export type Intensity =
  | "rookie"
  | "starter_barely"
  | "starter_normal"
  | "starter_dominant"
  | "all_star"
  | "mvp"
  | "goat"
  | "bust_close"
  | "bust_mid"
  | "bust_bad";

export type DetailId =
  | "record_event"
  | "rare_badge"
  | "common_badge"
  | "held_card_paid"
  | "high_stats"
  | "near_miss_win"
  | "near_miss_loss"
  | "streak_event"
  | "culture_hit"
  | "culture_loss"
  | "zero_card"
  | "turnover_problem"
  | "injury_cost"
  | "streak_broken";

export interface RecordEvent {
  type: "record_broken" | "near_record" | "career_milestone";
  stat: string;
  value: number;
  record: number;
  holder: string;
  label: string;
}

export interface StoryResult {
  storyId: StoryId;
  details: DetailId[];
  recordEvents: RecordEvent[];
}

export interface CommentaryTemplate {
  register: Register;
  story: StoryId;
  tone: ToneId;
  templates: string[];
}

export interface ComposedCommentary {
  message: string;
  tone: ToneId;
  storyId: StoryId;
  register: Register;
  intensity: Intensity;
}

/** Data bag passed to the template resolver for token replacement. */
export interface TemplateData {
  name: string;
  last: string;
  first: string;
  nick: string;
  nick2: string;
  pts: number;
  reb: number;
  ast: number;
  opp: string;
  badge: string;
  streak: number;
  gap: number;
  record: string;      // e.g. "The NBA record is 30."
  recordHolder: string; // e.g. "Scott Skiles"
  recordValue: number;
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/commentary/types.ts`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add shared/commentary/types.ts basketball/src/utils/buildPostRevealCopy.ts
git commit -m "feat(commentary): add types for new composer system"
```

---

### Task 2: Tone Engine

**Files:**
- Create: `shared/commentary/toneEngine.ts`

- [ ] **Step 1: Create tone engine**

```typescript
/**
 * toneEngine.ts — Session-aware weighted random tone selection.
 * Reads/writes recent tones to localStorage to prevent repetition.
 */

import type { ToneId, Intensity } from "./types";

const STORAGE_KEY = "rm_recent_tones";
const HISTORY_SIZE = 5;
const STALE_MS = 30 * 60 * 1000; // 30 minutes
const TIMESTAMP_KEY = "rm_tone_timestamp";

// ─── Weight tables ──────────────────────────────────────────────────────────

type WeightRow = Record<ToneId, number>;

const WIN_WEIGHTS: Record<string, WeightRow> = {
  rookie:           { hype: 5,  warm: 20, culture_wry: 35, observational: 20, analytical: 15, deadpan: 5 },
  starter_barely:   { hype: 15, warm: 20, culture_wry: 35, observational: 15, analytical: 10, deadpan: 5 },
  starter_normal:   { hype: 15, warm: 20, culture_wry: 35, observational: 15, analytical: 10, deadpan: 5 },
  starter_dominant: { hype: 15, warm: 20, culture_wry: 35, observational: 15, analytical: 10, deadpan: 5 },
  all_star:         { hype: 25, warm: 20, culture_wry: 35, observational: 15, analytical: 5,  deadpan: 0 },
  mvp:              { hype: 35, warm: 15, culture_wry: 35, observational: 10, analytical: 5,  deadpan: 0 },
  goat:             { hype: 45, warm: 15, culture_wry: 30, observational: 5,  analytical: 5,  deadpan: 0 },
};

const LOSS_WEIGHTS: Record<string, WeightRow> = {
  bust_close: { hype: 0, warm: 20, culture_wry: 35, observational: 20, analytical: 10, deadpan: 15 },
  bust_mid:   { hype: 0, warm: 10, culture_wry: 35, observational: 20, analytical: 10, deadpan: 25 },
  bust_bad:   { hype: 0, warm: 5,  culture_wry: 35, observational: 20, analytical: 10, deadpan: 30 },
};

// ─── History management ─────────────────────────────────────────────────────

function getRecentTones(): ToneId[] {
  try {
    const ts = Number(localStorage.getItem(TIMESTAMP_KEY) ?? 0);
    if (Date.now() - ts > STALE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as ToneId[] : [];
  } catch {
    return [];
  }
}

function pushTone(tone: ToneId): void {
  try {
    const history = getRecentTones();
    history.push(tone);
    if (history.length > HISTORY_SIZE) history.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    localStorage.setItem(TIMESTAMP_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (SSR, tests) — no-op
  }
}

// ─── Selection ──────────────────────────────────────────────────────────────

function applyPenalties(base: WeightRow, recent: ToneId[]): WeightRow {
  const adjusted = { ...base };
  const tones = Object.keys(adjusted) as ToneId[];

  for (const tone of tones) {
    const count = recent.filter(t => t === tone).length;
    if (count === 1) adjusted[tone] *= 0.5;
    else if (count === 2) adjusted[tone] *= 0.25;
    else if (count >= 3) adjusted[tone] *= 0.1;
  }

  // Normalize to sum = 100
  const total = tones.reduce((s, t) => s + adjusted[t], 0);
  if (total > 0) {
    for (const tone of tones) adjusted[tone] = (adjusted[tone] / total) * 100;
  }

  return adjusted;
}

function weightedRandom(weights: WeightRow, seed: number): ToneId {
  const tones = Object.keys(weights) as ToneId[];
  // Use seed for deterministic-ish selection (reproducible in tests)
  const roll = ((seed * 9301 + 49297) % 233280) / 233280 * 100;
  let cumulative = 0;
  for (const tone of tones) {
    cumulative += weights[tone];
    if (roll < cumulative) return tone;
  }
  return tones[tones.length - 1]; // fallback
}

/** Select a tone for this hand. Writes to localStorage history. */
export function selectTone(intensity: Intensity, seed: number): ToneId {
  const isLoss = intensity.startsWith("bust");
  const table = isLoss ? LOSS_WEIGHTS : WIN_WEIGHTS;
  const base = table[intensity];
  if (!base) return "observational"; // safety fallback

  const recent = getRecentTones();
  const adjusted = applyPenalties(base, recent);
  const tone = weightedRandom(adjusted, seed);
  pushTone(tone);
  return tone;
}

/** For testing: select tone without writing to localStorage. */
export function selectTonePure(intensity: Intensity, seed: number, recentTones: ToneId[]): ToneId {
  const isLoss = intensity.startsWith("bust");
  const table = isLoss ? LOSS_WEIGHTS : WIN_WEIGHTS;
  const base = table[intensity];
  if (!base) return "observational";

  const adjusted = applyPenalties(base, recentTones);
  return weightedRandom(adjusted, seed);
}

export { WIN_WEIGHTS, LOSS_WEIGHTS };
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/commentary/toneEngine.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/toneEngine.ts
git commit -m "feat(commentary): tone engine with session-aware anti-redundancy"
```

---

### Task 3: NBA Records Data + Detector

**Files:**
- Create: `shared/data/nbaRecords.ts`
- Create: `shared/data/recordDetector.ts`

- [ ] **Step 1: Create NBA records data**

```typescript
/**
 * nbaRecords.ts — NBA single-game records and notable thresholds.
 * Small static table. Updated manually when records break.
 */

export interface StatRecord {
  stat: string;
  record: number;
  holder: string;
  date: string;
  nearRecordPct: number;
}

export const NBA_SINGLE_GAME_RECORDS: StatRecord[] = [
  { stat: "pts",       record: 100, holder: "Wilt Chamberlain",  date: "1962-03-02", nearRecordPct: 0.75 },
  { stat: "ast",       record: 30,  holder: "Scott Skiles",      date: "1990-12-30", nearRecordPct: 0.75 },
  { stat: "reb",       record: 55,  holder: "Wilt Chamberlain",  date: "1960-11-24", nearRecordPct: 0.75 },
  { stat: "stl",       record: 11,  holder: "Kendall Gill",      date: "1999-04-03", nearRecordPct: 0.73 },
  { stat: "blk",       record: 17,  holder: "Elmore Smith",      date: "1973-10-28", nearRecordPct: 0.75 },
  { stat: "threes",    record: 16,  holder: "Klay Thompson",     date: "2018-10-29", nearRecordPct: 0.75 },
  { stat: "turnovers", record: 14,  holder: "Jason Kidd",        date: "2000-11-17", nearRecordPct: 0.85 },
];

/** Stat key aliases — game logs use inconsistent keys. */
export const STAT_ALIASES: Record<string, string[]> = {
  pts: ["pts", "points", "PTS"],
  ast: ["ast", "assists", "AST"],
  reb: ["reb", "rebounds", "REB", "trb"],
  stl: ["stl", "steals", "STL"],
  blk: ["blk", "blocks", "BLK"],
  threes: ["fg3m", "threes", "3pm", "FG3M"],
  turnovers: ["turnovers", "tov", "TOV"],
};
```

- [ ] **Step 2: Create record detector**

```typescript
/**
 * recordDetector.ts — Compare a stat line against records.
 * Returns RecordEvent[] for any broken or near records.
 */

import type { RecordEvent } from "../commentary/types";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "./nbaRecords";

function getStatValue(statLine: Record<string, any>, stat: string): number {
  const aliases = STAT_ALIASES[stat] ?? [stat];
  for (const alias of aliases) {
    const val = statLine[alias];
    if (val != null && typeof val === "number" && val > 0) return val;
  }
  return 0;
}

export function detectRecords(statLine: Record<string, any>): RecordEvent[] {
  const events: RecordEvent[] = [];

  for (const rec of NBA_SINGLE_GAME_RECORDS) {
    const value = getStatValue(statLine, rec.stat);
    if (value <= 0) continue;

    if (value >= rec.record) {
      events.push({
        type: "record_broken",
        stat: rec.stat,
        value,
        record: rec.record,
        holder: rec.holder,
        label: `Broke ${rec.holder}'s ${rec.stat} record of ${rec.record}`,
      });
    } else if (value >= rec.record * rec.nearRecordPct) {
      events.push({
        type: "near_record",
        stat: rec.stat,
        value,
        record: rec.record,
        holder: rec.holder,
        label: `${value} ${rec.stat} — NBA record is ${rec.record} (${rec.holder})`,
      });
    }
  }

  // Sort: record_broken first, then near_record
  events.sort((a, b) => (a.type === "record_broken" ? -1 : 1) - (b.type === "record_broken" ? -1 : 1));
  return events;
}
```

- [ ] **Step 3: Verify both compile**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/data/nbaRecords.ts shared/data/recordDetector.ts`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add shared/data/nbaRecords.ts shared/data/recordDetector.ts
git commit -m "feat(commentary): NBA records data + detector for record/near-record events"
```

---

### Task 4: Story Selector

**Files:**
- Create: `shared/commentary/storySelector.ts`

- [ ] **Step 1: Create story selector**

```typescript
/**
 * storySelector.ts — Star-first causal logic + probabilistic detail assembly.
 * Answers: "Why did I win or lose?" → a star carried or a star failed.
 */

import type {
  StoryId, DetailId, StoryResult, RecordEvent, Register,
} from "./types";
import type { PostRevealCopyInput, PostRevealRosterCard } from "./types";
import { detectRecords } from "../data/recordDetector";

// ─── Helpers (mirrored from buildPostRevealCopy to avoid import tangle) ─────

function isNameable(c: PostRevealRosterCard): boolean {
  const t = (c.cardTier ?? "").toUpperCase();
  return t === "RED" || t === "ORANGE" || t === "PURPLE";
}

function headlineScore(c: PostRevealRosterCard): number {
  const badgeFp = (c as any).achievements
    ? (c as any).achievements.reduce((b: number, a: any) => Math.max(b, Math.abs(a.fp ?? 0)), 0)
    : 0;
  return (c.salary * 2.5) + (c.actualFp * 1.5) + (badgeFp * 4);
}

function ratio(c: PostRevealRosterCard): number {
  const p = Number(c.projectedFp ?? 0);
  return p > 0 ? c.actualFp / p : 1;
}

function statN(c: PostRevealRosterCard, key: string): number {
  const s = c.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

// ─── Star selection ─────────────────────────────────────────────────────────

export function selectStar(roster: PostRevealRosterCard[]): PostRevealRosterCard | null {
  const nameable = roster.filter(isNameable);
  if (nameable.length > 0) {
    return [...nameable].sort((a, b) => headlineScore(b) - headlineScore(a))[0] ?? null;
  }
  return null;
}

// ─── Story ID ───────────────────────────────────────────────────────────────

function pickStoryId(register: Register, star: PostRevealRosterCard | null): StoryId {
  if (!star) return register === "win" ? "clean_win" : "everyone_flat";

  const r = ratio(star);

  if (register === "win") {
    if (r >= 1.35) return "star_went_off";
    if (r >= 1.0) return "star_delivered";
    return "star_quiet_win";
  } else {
    if (r < 0.65) return "star_no_showed";
    if (r < 0.75) return "star_cold";
    return "everyone_flat";
  }
}

// ─── Probabilistic detail assembly ──────────────────────────────────────────

interface DetailCandidate {
  id: DetailId;
  probability: number;
}

function roll(seed: number, index: number): number {
  return ((seed * 9301 + 49297 + index * 7919) % 233280) / 233280;
}

function assembleWinDetails(
  input: PostRevealCopyInput,
  star: PostRevealRosterCard | null,
  recordEvents: RecordEvent[],
  seed: number,
): DetailId[] {
  const candidates: DetailCandidate[] = [];
  const badges = star ? ((star as any).achievements ?? []).map((a: any) => a.id) : [];
  const rareBadges = ["QUAD_DBL", "5X5", "GOD_MODE", "MAESTRO"];
  const commonBadges = ["FIRE", "BEAST", "WIZARD", "TRIPLE_DBL", "GLASS", "DIME", "REJECTION",
    "THIEF", "DOUBLE_DBL", "BUCKET", "SWAT", "PICKPOCKET", "PURE"];

  if (recordEvents.length > 0) candidates.push({ id: "record_event", probability: 0.95 });
  if (badges.some((b: string) => rareBadges.includes(b))) candidates.push({ id: "rare_badge", probability: 0.80 });
  if (badges.some((b: string) => commonBadges.includes(b))) candidates.push({ id: "common_badge", probability: 0.60 });
  if (star?.wasHeld && ratio(star) >= 1.25) candidates.push({ id: "held_card_paid", probability: 0.80 });

  if (star) {
    const pts = statN(star, "pts");
    const reb = statN(star, "reb");
    const ast = statN(star, "ast");
    if (pts >= 30 || reb >= 12 || ast >= 10) candidates.push({ id: "high_stats", probability: 0.60 });
  }

  const gap = (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 999;
  if (gap > 0 && gap <= 3 && input.nextTier) candidates.push({ id: "near_miss_win", probability: 0.70 });

  const isFirstStreak = input.streak >= 3 && input.prevStreak < 3;
  const isMilestone = input.streak === 5 || input.streak === 10 || input.streak === 15;
  if (isFirstStreak || isMilestone) candidates.push({ id: "streak_event", probability: 0.12 });

  candidates.push({ id: "culture_hit", probability: 0.40 });

  // Shuffle then pick up to 2 details
  const shuffled = candidates.sort((a, b) => roll(seed, candidates.indexOf(a)) - roll(seed, candidates.indexOf(b)));

  // Exception: record_broken always goes first and always included
  const recordBroken = recordEvents.some(e => e.type === "record_broken");
  if (recordBroken) {
    const recIdx = shuffled.findIndex(c => c.id === "record_event");
    if (recIdx > 0) {
      const [rec] = shuffled.splice(recIdx, 1);
      shuffled.unshift(rec);
    }
  }

  const selected: DetailId[] = [];
  for (let i = 0; i < shuffled.length && selected.length < 2; i++) {
    const chance = selected.length === 0 ? shuffled[i].probability : shuffled[i].probability * 0.3;
    if (roll(seed, i + 100) < chance) {
      selected.push(shuffled[i].id);
    }
  }

  return selected;
}

function assembleLossDetails(
  input: PostRevealCopyInput,
  star: PostRevealRosterCard | null,
  recordEvents: RecordEvent[],
  seed: number,
): DetailId[] {
  const candidates: DetailCandidate[] = [];
  const badges = star ? ((star as any).achievements ?? []).map((a: any) => a.id) : [];

  if (recordEvents.length > 0) candidates.push({ id: "record_event", probability: 0.95 });

  // Near miss to ROOKIE
  const rookieMin = input.tierFloor ?? 0; // BUST tierFloor = 0, need ROOKIE min
  // gap to ROOKIE = nextTierMin (which for BUST is ROOKIE min)
  const gap = (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 999;
  if (gap > 0 && gap <= 3) candidates.push({ id: "near_miss_loss", probability: 0.80 });

  const zeroCard = input.roster.find(c => c.actualFp <= 1.0);
  if (zeroCard) candidates.push({ id: "zero_card", probability: 0.60 });

  if (badges.includes("TURNOVER_MACHINE")) candidates.push({ id: "turnover_problem", probability: 0.40 });

  if (star) {
    const mins = statN(star, "min") || statN(star, "minutes") || statN(star, "mp");
    if (mins > 0 && mins < 15 && star.actualFp < 8 && star.salary >= 30) {
      candidates.push({ id: "injury_cost", probability: 0.70 });
    }
  }

  if (input.prevStreak >= 5) candidates.push({ id: "streak_broken", probability: 0.15 });
  candidates.push({ id: "culture_loss", probability: 0.40 });

  const shuffled = candidates.sort((a, b) => roll(seed, candidates.indexOf(a)) - roll(seed, candidates.indexOf(b)));

  const selected: DetailId[] = [];
  for (let i = 0; i < shuffled.length && selected.length < 2; i++) {
    const chance = selected.length === 0 ? shuffled[i].probability : shuffled[i].probability * 0.3;
    if (roll(seed, i + 200) < chance) {
      selected.push(shuffled[i].id);
    }
  }

  return selected;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function selectStory(input: PostRevealCopyInput, seed: number): StoryResult {
  const register: Register = input.isBust ? "loss" : "win";
  const star = selectStar(input.roster);
  const storyId = pickStoryId(register, star);
  const recordEvents = star?.statLine ? detectRecords(star.statLine) : [];

  const details = register === "win"
    ? assembleWinDetails(input, star, recordEvents, seed)
    : assembleLossDetails(input, star, recordEvents, seed);

  return { storyId, details, recordEvents };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/commentary/storySelector.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/storySelector.ts
git commit -m "feat(commentary): star-first story selector with probabilistic detail assembly"
```

---

### Task 5: Template Bank (registry + basketball templates)

**Files:**
- Create: `shared/commentary/templateBank.ts`
- Create: `shared/commentary/templateBank.basketball.ts`

- [ ] **Step 1: Create template bank registry**

```typescript
/**
 * templateBank.ts — Template registry. Loads sport-specific template banks
 * and provides lookup by (register, story, tone).
 */

import type { CommentaryTemplate, Register, StoryId, ToneId } from "./types";
import { BASKETBALL_TEMPLATES } from "./templateBank.basketball";

const BANKS: Record<string, CommentaryTemplate[]> = {
  basketball: BASKETBALL_TEMPLATES,
};

/**
 * Look up templates matching (register, story, tone).
 * Returns the template string pool, or an empty array if no match.
 */
export function lookupTemplates(
  sport: string,
  register: Register,
  story: StoryId,
  tone: ToneId,
): string[] {
  const bank = BANKS[sport] ?? BANKS["basketball"];
  const match = bank.find(
    t => t.register === register && t.story === story && t.tone === tone,
  );
  return match?.templates ?? [];
}

/**
 * Fallback: look up by (register, tone) ignoring story — for clean_win/everyone_flat.
 */
export function lookupFallbackTemplates(
  sport: string,
  register: Register,
  tone: ToneId,
): string[] {
  const bank = BANKS[sport] ?? BANKS["basketball"];
  const fallbackStory: StoryId = register === "win" ? "clean_win" : "everyone_flat";
  const match = bank.find(
    t => t.register === register && t.story === fallbackStory && t.tone === tone,
  );
  return match?.templates ?? [];
}
```

- [ ] **Step 2: Create basketball template bank (initial seed ~80 templates)**

```typescript
/**
 * templateBank.basketball.ts — Basketball templates keyed by (register, story, tone).
 * Each entry has 3-6 alternatives with varied sentence structure and name forms.
 * Tokens: {name} {last} {first} {nick} {nick2} {pts} {reb} {ast} {opp} {badge} {streak} {gap} {record} {recordHolder} {recordValue}
 */

import type { CommentaryTemplate } from "./types";

export const BASKETBALL_TEMPLATES: CommentaryTemplate[] = [

  // ═══ WIN — star_went_off ═══════════════════════════════════════════════════

  { register: "win", story: "star_went_off", tone: "hype", templates: [
    "{name} dropped {pts}{opp} and this hand absolutely cashed. That's a night.",
    "{pts} points. That was all {last}. Statement game.",
    "Nobody was stopping {nick} tonight — {pts} and counting.",
    "{last} went off{opp}. {pts} points and the roster rode the wave.",
    "That's {nick} at full power. {pts}{opp}. Take your money.",
  ]},
  { register: "win", story: "star_went_off", tone: "warm", templates: [
    "Good night to have {name} on your roster. {pts} points, clean and efficient.",
    "{pts}{opp}. That's {last} doing exactly what you paid for.",
    "The roster had a guy tonight. {name} set the tone and never let up.",
    "{first} came through big. {pts} points and the whole roster benefited.",
  ]},
  { register: "win", story: "star_went_off", tone: "culture_wry", templates: [
    "{last} put up {pts}{opp} and honestly, someone should check on the opposing defense.",
    "{nick} decided to remind everyone tonight. {pts} points. Message received.",
    "Someone had to go for {pts}. {first} decided it was him.",
    "{pts} from {nick}{opp}. At this point it's just showing off.",
    "{name} treated this one like a personal vendetta. {pts} points of evidence.",
  ]},
  { register: "win", story: "star_went_off", tone: "observational", templates: [
    "{name} went for {pts}{opp}. The kind of performance that carries a hand.",
    "{pts} from {last} tonight. When the star delivers, everything else falls in place.",
    "{nick} was the story. {pts} points and the hand followed.",
  ]},
  { register: "win", story: "star_went_off", tone: "analytical", templates: [
    "{name} came in well above projection{opp}. {pts} points — that's the upside you pay for.",
    "{last} exceeded average by a wide margin tonight. The hand reflects it.",
    "The anchor outperformed. {pts} from {name}. That's how you build a winning hand.",
  ]},
  { register: "win", story: "star_went_off", tone: "deadpan", templates: [
    "{last} went for {pts}. Won. On to the next one.",
    "{pts} from {nick}. That'll do.",
    "{name} handled it. {pts}{opp}. Done.",
  ]},

  // ═══ WIN — star_delivered ══════════════════════════════════════════════════

  { register: "win", story: "star_delivered", tone: "hype", templates: [
    "{name} showed up when it mattered{opp}. That's what stars do.",
    "{last} brought it tonight. Not his biggest night, but enough to cash.",
    "{nick} delivered. The roster followed. Good hand.",
  ]},
  { register: "win", story: "star_delivered", tone: "warm", templates: [
    "Solid night from {name}. Did the job, the roster held up. Take the win.",
    "{last} was steady all night{opp}. No fireworks, just a good result.",
    "Professional performance from {first}. The kind of hand that adds up over time.",
  ]},
  { register: "win", story: "star_delivered", tone: "culture_wry", templates: [
    "{nick} didn't break a sweat and still cashed. Must be nice.",
    "{last} on cruise control is still better than most players trying hard.",
    "Average {nick} night. The rest of us wish our average looked like that.",
  ]},
  { register: "win", story: "star_delivered", tone: "observational", templates: [
    "{name} came in around projection{opp}. Consistent and the hand benefited.",
    "{last} did what was expected. The roster did the rest.",
  ]},
  { register: "win", story: "star_delivered", tone: "analytical", templates: [
    "{name} tracked close to average tonight. Consistent anchor play got the win.",
    "The star hit projection. The supporting cast stayed in range. Clean hand.",
  ]},
  { register: "win", story: "star_delivered", tone: "deadpan", templates: [
    "{last} did his job. Won. Move on.",
    "{nick} was fine. The hand was fine. Next.",
  ]},

  // ═══ WIN — star_quiet_win ═════════════════════════════════════════════════

  { register: "win", story: "star_quiet_win", tone: "hype", templates: [
    "The roster found a way without {name} going off. Team effort and it paid.",
    "Quiet night from {nick} but the hand still cashed. The supporting cast stepped up.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "warm", templates: [
    "{name} had a quiet one, but the roster held it together. A win is a win.",
    "Not {last}'s best night, but the hand survived. Take the money.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "culture_wry", templates: [
    "{nick} took the night off and the roster covered for it. Teamwork makes the dream work.",
    "Even on a quiet night, {last}'s floor is someone else's ceiling.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "observational", templates: [
    "{name} came in below average but the roster compensated. Balanced hand.",
    "Quiet from {last}{opp}. The bench made up the difference.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "analytical", templates: [
    "{name} underperformed projection but roster depth covered the gap.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "deadpan", templates: [
    "{last} was quiet. Still won. Doesn't matter how.",
  ]},

  // ═══ WIN — clean_win (no nameable star) ═══════════════════════════════════

  { register: "win", story: "clean_win", tone: "hype", templates: [
    "The roster came together tonight. No one player, just a solid collective effort.",
    "Everybody contributed. That's how you cash a hand.",
  ]},
  { register: "win", story: "clean_win", tone: "warm", templates: [
    "Good hand. The roster did its job across the board.",
    "No hero ball needed. The group effort got it done.",
  ]},
  { register: "win", story: "clean_win", tone: "culture_wry", templates: [
    "Nobody went nuclear but everybody showed up. The committee approach worked.",
    "Win by committee. Not sexy, but the money spends the same.",
  ]},
  { register: "win", story: "clean_win", tone: "observational", templates: [
    "Balanced output across the roster. No standout, just consistent play.",
  ]},
  { register: "win", story: "clean_win", tone: "analytical", templates: [
    "Contributions were spread evenly. No single driver — depth won this hand.",
  ]},
  { register: "win", story: "clean_win", tone: "deadpan", templates: [
    "Won. Nobody did anything special. On to the next.",
  ]},

  // ═══ LOSS — star_no_showed ════════════════════════════════════════════════

  { register: "loss", story: "star_no_showed", tone: "deadpan", templates: [
    "{last} came in way below the line. Not much else to say about this one.",
    "Needed {nick} to show up. Didn't happen.",
    "{name} was a no-show{opp}. That's the whole story.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "warm", templates: [
    "Tough one. {name} had an off night and the roster couldn't make up for it.",
    "{first} didn't have it tonight. Happens to everyone. Next hand.",
    "Off night from {last}{opp}. The supporting cast tried but it wasn't enough.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "culture_wry", templates: [
    "{nick} picked tonight to take a personal day. The roster noticed.",
    "{last} had more turnovers than highlights and that's genuinely hard to do.",
    "Way below his usual night. {name} owes the supporting cast an apology.",
    "{first} went ghost{opp}. The box score is evidence.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "observational", templates: [
    "{name} came in well below average{opp}. Hard to overcome that.",
    "{last} was the difference tonight — and not the good kind.",
    "The anchor underperformed significantly. {name} was the gap.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "analytical", templates: [
    "{name} came in far below projection. At that salary, the hand needed more.",
    "{last}'s output was insufficient to sustain the hand. The math wasn't there.",
  ]},

  // ═══ LOSS — star_cold ═════════════════════════════════════════════════════

  { register: "loss", story: "star_cold", tone: "deadpan", templates: [
    "{last} was cold. The hand followed. That's how it goes.",
    "Not {nick}'s night. Happens.",
  ]},
  { register: "loss", story: "star_cold", tone: "warm", templates: [
    "{name} had a rough one{opp}. One of those nights.",
    "Below the line from {last}. The roster didn't have enough to cover it.",
  ]},
  { register: "loss", story: "star_cold", tone: "culture_wry", templates: [
    "{nick} played like someone told him the game started at a different time.",
    "{last} was off and everybody else was just okay. Recipe for a bust.",
  ]},
  { register: "loss", story: "star_cold", tone: "observational", templates: [
    "{name} came in below average{opp}. The margin for error was thin and it showed.",
  ]},
  { register: "loss", story: "star_cold", tone: "analytical", templates: [
    "{name} tracked below projection tonight. Insufficient margin from the supporting cast.",
  ]},

  // ═══ LOSS — everyone_flat ═════════════════════════════════════════════════

  { register: "loss", story: "everyone_flat", tone: "deadpan", templates: [
    "Nobody had it tonight. Sometimes the cards don't come in.",
    "Flat across the board. Not one card pulled its weight.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "warm", templates: [
    "Tough night all around. Nobody could get anything going.",
    "The whole roster had an off night. Take the L and move on.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "culture_wry", templates: [
    "The entire roster collectively decided to take the night off.",
    "If this hand was a group project, nobody did their part.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "observational", templates: [
    "No single culprit. Every card came in below the line.",
    "The roster underperformed across the board. Collective miss.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "analytical", templates: [
    "Every card tracked below projection. No individual cause — systemic underperformance.",
  ]},
];
```

- [ ] **Step 3: Verify both compile**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/commentary/templateBank.ts shared/commentary/templateBank.basketball.ts`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add shared/commentary/templateBank.ts shared/commentary/templateBank.basketball.ts
git commit -m "feat(commentary): template bank registry + basketball templates (~80 initial)"
```

---

### Task 6: Template Resolver

**Files:**
- Create: `shared/commentary/templateResolver.ts`

- [ ] **Step 1: Create template resolver**

```typescript
/**
 * templateResolver.ts — Resolves template tokens and injects supporting details.
 * Tokens: {name} {last} {first} {nick} {nick2} {pts} {reb} {ast} {opp} {badge} {streak} {gap} {record} {recordHolder} {recordValue}
 */

import type { TemplateData, DetailId, RecordEvent } from "./types";
import type { PostRevealCopyInput, PostRevealRosterCard } from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function lastName(n: string): string {
  const parts = n.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? n;
}

function statN(c: PostRevealRosterCard, key: string): number {
  const s = c.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

const CITY: Record<string, string> = {
  ATL:"Atlanta",BOS:"Boston",BKN:"Brooklyn",CHA:"Charlotte",CHI:"Chicago",
  CLE:"Cleveland",DAL:"Dallas",DEN:"Denver",DET:"Detroit",GSW:"Golden State",
  HOU:"Houston",IND:"Indiana",LAC:"LA",LAL:"LA",MEM:"Memphis",MIA:"Miami",
  MIL:"Milwaukee",MIN:"Minnesota",NOP:"New Orleans",NYK:"New York",OKC:"OKC",
  ORL:"Orlando",PHI:"Philly",PHX:"Phoenix",POR:"Portland",SAC:"Sacramento",
  SAS:"San Antonio",TOR:"Toronto",UTA:"Utah",WAS:"Washington",
};

function oppPhrase(c: PostRevealRosterCard): string {
  const city = CITY[c.opponent?.toUpperCase() ?? ""] ?? c.opponent ?? "";
  if (!city) return "";
  return c.homeAway === "A" ? ` in ${city}` : ` against ${city}`;
}

// ─── Build template data ────────────────────────────────────────────────────

export function buildTemplateData(
  star: PostRevealRosterCard | null,
  input: PostRevealCopyInput,
  recordEvents: RecordEvent[],
  culture: { nicknames?: string[] } | null,
): TemplateData {
  const name = star?.name ?? "The roster";
  const last = star ? lastName(star.name) : "the roster";
  const first = star ? star.name.trim().split(/\s+/)[0] : "the roster";
  const nick = culture?.nicknames?.[0] ?? last;
  const nick2 = culture?.nicknames?.[1] ?? nick;
  const opp = star ? oppPhrase(star) : "";
  const badges = star ? ((star as any).achievements ?? []) : [];
  const badgeLabel = badges[0]?.label ?? "";
  const rec = recordEvents[0];

  return {
    name,
    last,
    first,
    nick,
    nick2,
    pts: star ? statN(star, "pts") : 0,
    reb: star ? statN(star, "reb") : 0,
    ast: star ? statN(star, "ast") : 0,
    opp,
    badge: badgeLabel,
    streak: input.streak,
    gap: (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 0,
    record: rec ? `The NBA record is ${rec.record}.` : "",
    recordHolder: rec?.holder ?? "",
    recordValue: rec?.record ?? 0,
  };
}

// ─── Resolve tokens ─────────────────────────────────────────────────────────

export function resolveTemplate(template: string, data: TemplateData): string {
  return template
    .replace(/\{name\}/g, data.name)
    .replace(/\{last\}/g, data.last)
    .replace(/\{first\}/g, data.first)
    .replace(/\{nick\}/g, data.nick)
    .replace(/\{nick2\}/g, data.nick2)
    .replace(/\{pts\}/g, String(data.pts))
    .replace(/\{reb\}/g, String(data.reb))
    .replace(/\{ast\}/g, String(data.ast))
    .replace(/\{opp\}/g, data.opp)
    .replace(/\{badge\}/g, data.badge)
    .replace(/\{streak\}/g, String(data.streak))
    .replace(/\{gap\}/g, String(data.gap))
    .replace(/\{record\}/g, data.record)
    .replace(/\{recordHolder\}/g, data.recordHolder)
    .replace(/\{recordValue\}/g, String(data.recordValue));
}

// ─── Supporting detail injection ────────────────────────────────────────────

const DETAIL_SNIPPETS: Record<string, (data: TemplateData) => string> = {
  record_event: (d) => d.record ? `${d.record}` : "",
  rare_badge: (d) => d.badge ? `${d.badge} on the stat sheet.` : "",
  common_badge: (d) => d.badge ? `${d.badge}.` : "",
  held_card_paid: () => "Holding that card was the right call.",
  high_stats: (d) => {
    if (d.pts >= 30) return `${d.pts} points.`;
    if (d.reb >= 12) return `${d.reb} boards.`;
    if (d.ast >= 10) return `${d.ast} assists.`;
    return "";
  },
  near_miss_win: (d) => d.gap > 0 ? `${d.gap} away from the next level.` : "",
  near_miss_loss: (d) => d.gap > 0 ? `${d.gap} short. Almost survived it.` : "",
  streak_event: (d) => d.streak > 0 ? `That's ${d.streak} in a row.` : "",
  streak_broken: () => "The streak is done.",
  zero_card: () => "Someone on the roster gave you nothing.",
  turnover_problem: () => "The turnovers didn't help.",
  injury_cost: () => "Limited minutes from a key card hurt.",
  culture_hit: () => "", // Culture is embedded in the template itself, not injected
  culture_loss: () => "",
};

// ─── Compose final message ──────────────────────────────────────────────────

const MAX_CHARS = 200;

function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastPunct = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );
  return lastPunct > 50 ? truncated.slice(0, lastPunct + 1) : truncated;
}

export function composeMessage(
  template: string,
  data: TemplateData,
  details: DetailId[],
): string {
  let message = resolveTemplate(template, data);

  // Inject detail snippets — only if main message leaves room
  for (const detailId of details) {
    const snippetFn = DETAIL_SNIPPETS[detailId];
    if (!snippetFn) continue;
    const snippet = snippetFn(data);
    if (!snippet) continue;
    // Don't duplicate info already in the main template
    if (message.toLowerCase().includes(snippet.toLowerCase().slice(0, 15))) continue;
    if (message.length + snippet.length + 1 > MAX_CHARS) break;
    message += ` ${snippet}`;
  }

  return capAtSentence(message, MAX_CHARS);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/commentary/templateResolver.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/templateResolver.ts
git commit -m "feat(commentary): template resolver with token replacement and detail injection"
```

---

### Task 7: Unified Composer (orchestrator)

**Files:**
- Create: `shared/commentary/composeCommentary.ts`

- [ ] **Step 1: Create the composer**

```typescript
/**
 * composeCommentary.ts — The unified composer. Orchestrates Steps 1-6.
 * Sport-agnostic: uses PostRevealCopyInput and delegates to sport-specific template banks.
 */

import type {
  Register, Intensity, ToneId, ComposedCommentary,
} from "./types";
import type { PostRevealCopyInput, PostRevealCopy } from "./types";
import { selectTone } from "./toneEngine";
import { selectStory, selectStar } from "./storySelector";
import { lookupTemplates, lookupFallbackTemplates } from "./templateBank";
import { buildTemplateData, composeMessage } from "./templateResolver";
import { PLAYER_CULTURE } from "../../basketball/src/utils/playerCulture";

// ─── Step 1: Register ───────────────────────────────────────────────────────

function determineRegister(input: PostRevealCopyInput): Register {
  return input.isBust ? "loss" : "win";
}

// ─── Step 2: Intensity ──────────────────────────────────────────────────────

function determineIntensity(input: PostRevealCopyInput): Intensity {
  const { winTier, totalFp, tierFloor, nextTierMin, isBust } = input;
  const margin = totalFp - (tierFloor ?? 0);

  if (isBust) {
    const gap = (nextTierMin ?? 0) > 0 ? (nextTierMin! - totalFp) : 999;
    if (gap <= 8) return "bust_close";
    if (gap <= 25) return "bust_mid";
    return "bust_bad";
  }

  switch (winTier) {
    case "GOAT": return "goat";
    case "MVP": return "mvp";
    case "ALL_STAR": return "all_star";
    case "STARTER":
      if (margin <= 5) return "starter_barely";
      if (margin >= 15) return "starter_dominant";
      return "starter_normal";
    case "ROOKIE": return "rookie";
    default: return "starter_normal";
  }
}

// ─── Culture lookup (same key as existing system) ───────────────────────────

function lookupCulture(name: string): { nicknames?: string[] } | null {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  return PLAYER_CULTURE[last] ?? null;
}

// ─── Pick helper ────────────────────────────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  if (!arr.length) return "" as any;
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

// ─── ROOKIE half-back flag (~40%) ───────────────────────────────────────────

function isHalfBack(intensity: Intensity, seed: number): boolean {
  if (intensity !== "rookie") return false;
  return ((seed * 7919) % 100) < 40;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function composeCommentary(input: PostRevealCopyInput): PostRevealCopy {
  const seed = Math.floor(input.totalFp * 13) + input.streak * 7 + (input.isBust ? 3 : 0);

  // Step 1: Register
  const register = determineRegister(input);

  // Step 2: Intensity
  const intensity = determineIntensity(input);

  // Step 3: Star (handled inside storySelector)
  const star = selectStar(input.roster);
  const culture = star ? lookupCulture(star.name) : null;

  // Step 4: Story + details
  const { storyId, details, recordEvents } = selectStory(input, seed);

  // Step 5: Tone
  const tone = selectTone(intensity, seed);

  // Step 6: Compose
  let templates = lookupTemplates(input.sport, register, storyId, tone);
  if (templates.length === 0) {
    templates = lookupFallbackTemplates(input.sport, register, tone);
  }
  if (templates.length === 0) {
    // Ultimate fallback
    return { primary: register === "win" ? "Good hand." : "Tough night." };
  }

  const template = pick(templates, seed);
  const data = buildTemplateData(star, input, recordEvents, culture);

  // ROOKIE half-back: prepend "Half your money back." ~40% of the time
  let message = composeMessage(template, data, details);
  if (isHalfBack(intensity, seed) && !message.toLowerCase().includes("half")) {
    message = `Half your money back. ${message}`;
  }

  return { primary: message };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit shared/commentary/composeCommentary.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/composeCommentary.ts
git commit -m "feat(commentary): unified composer orchestrating the 6-step pipeline"
```

---

### Task 8: Feature Flag Integration

**Files:**
- Modify: `basketball/src/views/GameView.tsx:23,989-1014`

- [ ] **Step 1: Add import for new composer**

At line 23 of `GameView.tsx`, alongside the existing import:

```typescript
import { buildPostRevealCopy } from "../utils/buildPostRevealCopy";
import { composeCommentary } from "../../../shared/commentary/composeCommentary";
```

- [ ] **Step 2: Add feature flag and switch call site**

At line 989, replace the `buildPostRevealCopy` call:

```typescript
    const USE_NEW_COMMENTARY = true; // Feature flag — flip to false to revert

    const copyInput = {
      totalFp: fp,
      winTier,
      nextTier: gaugeSnap.nextTier,
      tierFloor: gaugeSnap.curMin,
      nextTierMin: gaugeSnap.nextMin > 0 && gaugeSnap.nextMin < 9999 ? gaugeSnap.nextMin : 0,
      roster: roster.map(c => ({
        name: String((c as any).name ?? ""),
        salary: Number((c as any).salary ?? 0),
        actualFp: Number((c as any).actualFp ?? 0),
        projectedFp: Number((c as any).projectedFp ?? 0) || undefined,
        achievements: ((c as any).achievements ?? []) as Array<{ id: string; label: string; icon?: string; fp?: number }>,
        opponent: String((c as any).gameInfo?.opponent ?? ""),
        gameDate: String((c as any).gameInfo?.date ?? ""),
        statLine: ((c as any).statLine ?? {}) as Record<string, any>,
        wasHeld: Boolean((c as any).wasHeld ?? false),
        homeAway: String((c as any).gameInfo?.homeAway ?? "") as "H" | "A" | "",
        cardTier: String((c as any).tier ?? ""),
      })),
      streak,
      prevStreak: winTier === "BUST" ? streak : Math.max(0, streak - 1),
      isBust: winTier === "BUST",
      ceilingPct: ceilingPct ?? undefined,
      isFTUE,
      handCount,
      sport: "basketball",
    };

    const copy = USE_NEW_COMMENTARY
      ? composeCommentary(copyInput)
      : buildPostRevealCopy(copyInput);
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit basketball/src/views/GameView.tsx`
Expected: No errors (may need to add `sport` to `PostRevealCopyInput` — if so, add `sport: string` to the interface in types.ts).

- [ ] **Step 4: Commit**

```bash
git add basketball/src/views/GameView.tsx shared/commentary/types.ts
git commit -m "feat(commentary): wire feature flag to switch between old and new system"
```

---

### Task 9: Scenario Test Harness

**Files:**
- Create: `basketball/src/tools/commentaryAudit.ts`

- [ ] **Step 1: Create the audit tool**

```typescript
/**
 * commentaryAudit.ts — Scenario generator + rule-based grader + report.
 * Run: npx tsx basketball/src/tools/commentaryAudit.ts
 */

import { composeCommentary } from "../../../shared/commentary/composeCommentary";
import type { PostRevealCopyInput, PostRevealRosterCard } from "../../../shared/commentary/types";

// ─── Scenario generator ─────────────────────────────────────────────────────

interface ScenarioConfig {
  winTier: string;
  margin: number;
  nearMissGap: number;
  starRatio: number;
  streak: number;
  prevStreak: number;
  badge: string;
  heldPaidOff: boolean;
  rosterShape: "1star" | "2star";
}

const WIN_TIERS = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"];
const MARGINS = [2, 8, 20]; // barely, comfortable, dominant
const NEAR_MISS_GAPS = [0, 2, 6]; // none, <=3, 4-8
const STAR_RATIOS = [0.5, 0.7, 1.0, 1.2, 1.6];
const STREAKS = [0, 3, 5, 10];
const BADGES = ["none", "FIRE", "GOD_MODE", "TURNOVER_MACHINE"];
const ROSTER_SHAPES = ["1star", "2star"] as const;

const TIER_FLOORS: Record<string, number> = {
  BUST: 0, ROOKIE: 180, STARTER: 195, ALL_STAR: 210, MVP: 225, GOAT: 240,
};
const TIER_NEXT: Record<string, string | null> = {
  BUST: "ROOKIE", ROOKIE: "STARTER", STARTER: "ALL_STAR", ALL_STAR: "MVP", MVP: "GOAT", GOAT: null,
};
const NEXT_MINS: Record<string, number> = {
  ROOKIE: 180, STARTER: 195, ALL_STAR: 210, MVP: 225, GOAT: 240,
};

function buildRoster(shape: "1star" | "2star", starRatio: number, badge: string, held: boolean): PostRevealRosterCard[] {
  const starCard = (name: string, salary: number, tier: string): PostRevealRosterCard => ({
    name,
    salary,
    actualFp: Math.round(30 * starRatio),
    projectedFp: 30,
    cardTier: tier,
    statLine: { pts: Math.round(25 * starRatio), reb: 6, ast: 5, stl: 1, blk: 0, turnovers: badge === "TURNOVER_MACHINE" ? 7 : 2 },
    opponent: "IND",
    homeAway: "H" as const,
    wasHeld: held,
    achievements: badge !== "none" ? [{ id: badge, label: badge, fp: badge === "GOD_MODE" ? 10 : 5 }] : [],
  } as any);

  const benchCard = (name: string): PostRevealRosterCard => ({
    name,
    salary: 15,
    actualFp: 18,
    projectedFp: 18,
    cardTier: "BLUE",
    statLine: { pts: 12, reb: 3, ast: 2, stl: 0, blk: 0, turnovers: 1 },
    opponent: "IND",
    homeAway: "H" as const,
    wasHeld: false,
    achievements: [],
  } as any);

  if (shape === "2star") {
    return [
      starCard("Anthony Edwards", 62, "ORANGE"),
      starCard("Trae Young", 55, "PURPLE"),
      benchCard("Player Three"),
      benchCard("Player Four"),
      benchCard("Player Five"),
    ];
  }
  return [
    starCard("Anthony Edwards", 62, "ORANGE"),
    benchCard("Player Two"),
    benchCard("Player Three"),
    benchCard("Player Four"),
    benchCard("Player Five"),
  ];
}

function buildScenario(config: ScenarioConfig): PostRevealCopyInput {
  const isBust = config.winTier === "BUST";
  const tierFloor = TIER_FLOORS[config.winTier] ?? 0;
  const totalFp = isBust ? tierFloor - 10 : tierFloor + config.margin;
  const nextTier = TIER_NEXT[config.winTier] ?? null;
  const nextTierMin = nextTier ? NEXT_MINS[nextTier] ?? 0 : 0;

  return {
    sport: "basketball",
    totalFp,
    winTier: config.winTier as any,
    nextTier: nextTier as any,
    tierFloor,
    nextTierMin: config.nearMissGap > 0 ? totalFp + config.nearMissGap : nextTierMin,
    roster: buildRoster(config.rosterShape, config.starRatio, config.badge, config.heldPaidOff),
    streak: config.streak,
    prevStreak: config.prevStreak,
    isBust,
    handCount: 10,
    isFTUE: false,
  } as any;
}

function generateScenarios(): { input: PostRevealCopyInput; label: string }[] {
  const scenarios: { input: PostRevealCopyInput; label: string }[] = [];

  for (const winTier of WIN_TIERS) {
    for (const margin of MARGINS) {
      for (const nearMissGap of NEAR_MISS_GAPS) {
        for (const starRatio of STAR_RATIOS) {
          for (const streak of STREAKS) {
            for (const badge of BADGES) {
              for (const rosterShape of ROSTER_SHAPES) {
                const prevStreak = streak > 0 && winTier === "BUST" ? streak : Math.max(0, streak - 1);
                const config: ScenarioConfig = {
                  winTier, margin, nearMissGap, starRatio, streak, prevStreak,
                  badge, heldPaidOff: starRatio >= 1.25 && badge !== "TURNOVER_MACHINE",
                  rosterShape,
                };
                const label = `${winTier}|m${margin}|nm${nearMissGap}|r${starRatio}|s${streak}|${badge}|${rosterShape}`;
                scenarios.push({ input: buildScenario(config), label });
              }
            }
          }
        }
      }
    }
  }

  return scenarios;
}

// ─── Rule-based grader ──────────────────────────────────────────────────────

type Severity = "PASS" | "FAIL" | "WARN";

interface GradeResult {
  severity: Severity;
  check: string;
  reason: string;
}

const BANNED_WORDS = [
  "fp", "fantasy points", "projection", "perf",
  "rookie tier", "starter tier", "all-star tier", "mvp tier", "goat tier",
  "rookie money", "starter money",
];

const NEGATIVE_MARKERS = [
  "no-show", "didn't show", "failed", "couldn't", "never showed",
  "took a personal day", "went ghost", "owes", "cold", "off night",
  "rough", "below the line", "below his line", "below average",
  "underperformed", "not enough", "didn't have it",
];

const POSITIVE_MARKERS = [
  "cashed", "delivered", "dropped", "went off", "went for",
  "showed up", "set the tone", "statement", "take your money",
  "good night", "solid", "clean", "professional", "great hand",
];

function grade(message: string, input: PostRevealCopyInput, label: string): GradeResult[] {
  const results: GradeResult[] = [];
  const lower = message.toLowerCase();
  const isWin = !input.isBust;

  // Length check
  if (message.length < 80) results.push({ severity: "FAIL", check: "length", reason: `Too short: ${message.length} chars` });
  if (message.length > 200) results.push({ severity: "FAIL", check: "length", reason: `Too long: ${message.length} chars` });

  // Banned content
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      results.push({ severity: "FAIL", check: "banned_content", reason: `Contains "${word}"` });
    }
  }

  // Register consistency
  if (isWin) {
    const negCount = NEGATIVE_MARKERS.filter(m => lower.includes(m)).length;
    if (negCount >= 2) {
      results.push({ severity: "FAIL", check: "register_inconsistency", reason: `Win message has ${negCount} negative markers` });
    }
  } else {
    const posCount = POSITIVE_MARKERS.filter(m => lower.includes(m)).length;
    if (posCount >= 2) {
      results.push({ severity: "FAIL", check: "register_inconsistency", reason: `Loss message has ${posCount} positive markers` });
    }
  }

  // Star-first: check if a player name appears in the message
  const nameableCards = input.roster.filter(c => {
    const t = (c.cardTier ?? "").toUpperCase();
    return t === "RED" || t === "ORANGE" || t === "PURPLE";
  });
  if (nameableCards.length > 0) {
    const hasName = nameableCards.some(c => {
      const parts = c.name.trim().split(/\s+/);
      const last = parts[parts.length - 1]?.toLowerCase() ?? "";
      return last.length >= 3 && lower.includes(last);
    });
    if (!hasName) {
      results.push({ severity: "FAIL", check: "star_missing", reason: "No nameable player referenced" });
    }
  }

  // Non-nameable player name leak
  const nonNameable = input.roster.filter(c => {
    const t = (c.cardTier ?? "").toUpperCase();
    return t !== "RED" && t !== "ORANGE" && t !== "PURPLE";
  });
  for (const c of nonNameable) {
    const parts = c.name.trim().split(/\s+/);
    const last = parts[parts.length - 1]?.toLowerCase() ?? "";
    if (last.length > 4 && lower.includes(last)) {
      results.push({ severity: "FAIL", check: "banned_content", reason: `Non-nameable player "${c.name}" referenced` });
    }
  }

  if (results.length === 0) {
    results.push({ severity: "PASS", check: "all", reason: "" });
  }

  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  // Mock localStorage for CLI environment
  const storage: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
  };

  const scenarios = generateScenarios();
  console.log(`\nCommentary Audit — ${scenarios.length} scenarios`);
  console.log("═".repeat(50));

  let pass = 0;
  let fail = 0;
  let warn = 0;
  const failBreakdown: Record<string, number> = {};
  const messages = new Map<string, string[]>(); // message -> labels (redundancy check)
  const failedExamples: { label: string; message: string; reason: string }[] = [];

  for (const { input, label } of scenarios) {
    const result = composeCommentary(input);
    const message = result.primary;
    const grades = grade(message, input, label);
    const worst = grades.reduce((w, g) =>
      g.severity === "FAIL" ? "FAIL" : g.severity === "WARN" && w !== "FAIL" ? "WARN" : w,
      "PASS" as Severity,
    );

    if (worst === "PASS") {
      pass++;
    } else if (worst === "FAIL") {
      fail++;
      for (const g of grades.filter(g => g.severity === "FAIL")) {
        failBreakdown[g.check] = (failBreakdown[g.check] ?? 0) + 1;
        if (failedExamples.length < 20) {
          failedExamples.push({ label, message, reason: g.reason });
        }
      }
    } else {
      warn++;
    }

    // Redundancy tracking
    const existing = messages.get(message);
    if (existing) {
      existing.push(label);
    } else {
      messages.set(message, [label]);
    }
  }

  // Count redundant messages
  let redundant = 0;
  for (const [msg, labels] of messages) {
    if (labels.length > 1) redundant += labels.length;
  }
  if (redundant > 0) {
    failBreakdown["redundancy"] = redundant;
    fail += redundant; // each redundant counts as a failure
  }

  const total = scenarios.length;
  console.log(`Pass: ${pass} (${((pass / total) * 100).toFixed(0)}%)`);
  console.log(`Fail: ${fail} (${((fail / total) * 100).toFixed(0)}%)`);
  console.log(`Warn: ${warn} (${((warn / total) * 100).toFixed(0)}%)`);
  console.log("");

  if (Object.keys(failBreakdown).length > 0) {
    console.log("Rejection breakdown:");
    const sorted = Object.entries(failBreakdown).sort((a, b) => b[1] - a[1]);
    for (const [check, count] of sorted) {
      console.log(`  - ${count}× ${check}`);
    }
  }

  if (failedExamples.length > 0) {
    console.log("\nSample failures:");
    for (const { label, message, reason } of failedExamples.slice(0, 10)) {
      console.log(`  [${label}]`);
      console.log(`    "${message}"`);
      console.log(`    Reason: ${reason}`);
    }
  }

  // Redundancy report
  const dupes = [...messages.entries()].filter(([, l]) => l.length > 1).slice(0, 5);
  if (dupes.length > 0) {
    console.log("\nMost duplicated messages:");
    for (const [msg, labels] of dupes) {
      console.log(`  "${msg.slice(0, 60)}..." — ${labels.length} scenarios`);
    }
  }
}

main();
```

- [ ] **Step 2: Test the audit tool runs**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/commentaryAudit.ts`
Expected: Report prints showing pass/fail counts and breakdown. First run will likely show 50-70% pass rate — that's expected. The iteration loop improves it.

- [ ] **Step 3: Commit**

```bash
git add basketball/src/tools/commentaryAudit.ts
git commit -m "feat(commentary): scenario test harness — generator + grader + report"
```

---

### Task 10: First Audit Run + Template Iteration

This is the quality loop. No new files — just running the audit and fixing templates.

- [ ] **Step 1: Run first audit**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/commentaryAudit.ts`

Read the report. Note which checks have the most failures.

- [ ] **Step 2: Fix failing templates**

Common fixes based on expected failures:
- `star_missing` → template uses `{name}` but the scenario has no star. Add guard in composer or add more `clean_win`/`everyone_flat` templates.
- `register_inconsistency` → a win template has negative language. Rewrite the template.
- `redundancy` → not enough template variety. Add more alternatives to thin pools.
- `length` → templates too short after token resolution. Pad with detail or lengthen base template.

Edit `shared/commentary/templateBank.basketball.ts` to fix the flagged templates.

- [ ] **Step 3: Re-run audit**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/commentaryAudit.ts`
Target: ≥ 80% pass rate on second run.

- [ ] **Step 4: Iterate until ≥ 90% pass rate**

Repeat steps 2-3 until the report shows ≥ 90% pass rate. Each cycle should improve by 10-15%.

- [ ] **Step 5: Commit final template bank**

```bash
git add shared/commentary/templateBank.basketball.ts
git commit -m "feat(commentary): iterate templates to 90%+ pass rate on audit"
```

---

### Task 11: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `cd /Users/john/Desktop/ReplayMod && npm run dev`

- [ ] **Step 2: Play 10 hands and observe commentary**

Check:
- Win messages feel congratulatory
- Loss messages feel honest, not cruel
- Player names appear in varied positions (not always leading)
- Tone varies across hands (not the same every time)
- ROOKIE wins occasionally say "half your money back"
- Near-misses only appear as secondary detail, never the lead
- No "FP", tier names, or engine internals leak through

- [ ] **Step 3: If issues found, fix and re-run audit**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(commentary): new unified composer system — passing audit + manual smoke test"
```

# Unified Commentary Engine — Part 2: Runtime Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the runtime selector (`selectCommentary`), anti-repeat system, remix engine, and migrate existing templates to the new `CommentaryLine` library format.

**Architecture:** `selectCommentary()` replaces `composeCommentary()` as the main entry point. It consumes `CommentaryContext`, filters the line library by archetype/tone/requires/forbids, applies anti-repeat, picks the best line, fills tokens, and optionally applies remix for MVP/GOAT. Legacy `composeCommentary` is moved to `legacy/` and kept as fallback.

---

### Task 6: Create antiRepeat.ts — multi-dimension repeat tracking

**Files:**
- Create: `shared/commentary/antiRepeat.ts`

- [ ] **Step 1: Create the anti-repeat module**

```ts
/**
 * antiRepeat.ts — Multi-dimension repeat tracking.
 *
 * Tracks 5 dimensions in localStorage:
 * 1. lineId — exact line used
 * 2. archetype — narrative type
 * 3. tone — voice register
 * 4. openingPhrase — first 4 words of the resolved line
 * 5. comparisonPattern — comparison structure (e.g. "treated X like Y")
 *
 * Each dimension has its own history window and penalty weight.
 */

import type { CommentaryArchetype } from "./types";
import type { ToneId } from "./types";

const STORAGE_KEY = "rm_antirepeat";
const STALE_MS = 60 * 60 * 1000; // 1 hour

export interface RepeatHistory {
  lineIds: string[];
  archetypes: string[];
  tones: string[];
  openingPhrases: string[];
  comparisonPatterns: string[];
  timestamp: number;
}

const WINDOW_SIZES = {
  lineIds: 10,
  archetypes: 5,
  tones: 5,
  openingPhrases: 8,
  comparisonPatterns: 6,
};

function getHistory(): RepeatHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshHistory();
    const h = JSON.parse(raw) as RepeatHistory;
    if (Date.now() - h.timestamp > STALE_MS) return freshHistory();
    return h;
  } catch {
    return freshHistory();
  }
}

function freshHistory(): RepeatHistory {
  return {
    lineIds: [],
    archetypes: [],
    tones: [],
    openingPhrases: [],
    comparisonPatterns: [],
    timestamp: Date.now(),
  };
}

function saveHistory(h: RepeatHistory): void {
  try {
    h.timestamp = Date.now();
    // Trim each dimension to its window
    h.lineIds = h.lineIds.slice(-WINDOW_SIZES.lineIds);
    h.archetypes = h.archetypes.slice(-WINDOW_SIZES.archetypes);
    h.tones = h.tones.slice(-WINDOW_SIZES.tones);
    h.openingPhrases = h.openingPhrases.slice(-WINDOW_SIZES.openingPhrases);
    h.comparisonPatterns = h.comparisonPatterns.slice(-WINDOW_SIZES.comparisonPatterns);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {
    // SSR / test — no-op
  }
}

/** Extract first 4 words as opening phrase fingerprint */
export function extractOpeningPhrase(line: string): string {
  return line.split(/\s+/).slice(0, 4).join(" ").toLowerCase();
}

/** Extract comparison pattern if present (e.g. "treated X like Y" → "treated_like") */
export function extractComparisonPattern(line: string): string | null {
  const lower = line.toLowerCase();
  const patterns = [
    /treated .+ like/,
    /made .+ look/,
    /turned .+ into/,
    /played like/,
    /felt like/,
    /looked like/,
    /reminded .+ of/,
    /is .+ the new/,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) return m[0].replace(/\s+/g, "_").slice(0, 30);
  }
  return null;
}

export interface RepeatPenalty {
  /** 0.0 = blocked, 1.0 = no penalty */
  score: number;
  reasons: string[];
}

/**
 * Score a candidate line against repeat history.
 * Returns a penalty multiplier (0.0–1.0) and reasons.
 */
export function scoreRepeatPenalty(
  lineId: string,
  archetype: CommentaryArchetype,
  tone: ToneId,
  resolvedLine: string,
): RepeatPenalty {
  const h = getHistory();
  let score = 1.0;
  const reasons: string[] = [];

  // Dimension 1: exact line ID — hard block if in last 10
  if (h.lineIds.includes(lineId)) {
    score = 0.0;
    reasons.push("exact_line_repeat");
    return { score, reasons };
  }

  // Dimension 2: archetype — penalize same archetype in last 5
  const archCount = h.archetypes.filter(a => a === archetype).length;
  if (archCount >= 2) { score *= 0.3; reasons.push("archetype_saturated"); }
  else if (archCount === 1) { score *= 0.6; reasons.push("archetype_recent"); }

  // Dimension 3: tone — penalize same tone in last 5
  const toneCount = h.tones.filter(t => t === tone).length;
  if (toneCount >= 2) { score *= 0.4; reasons.push("tone_saturated"); }
  else if (toneCount === 1) { score *= 0.7; reasons.push("tone_recent"); }

  // Dimension 4: opening phrase — penalize similar openings
  const opening = extractOpeningPhrase(resolvedLine);
  if (h.openingPhrases.includes(opening)) {
    score *= 0.3;
    reasons.push("opening_repeat");
  }

  // Dimension 5: comparison pattern — penalize same structure
  const comp = extractComparisonPattern(resolvedLine);
  if (comp && h.comparisonPatterns.includes(comp)) {
    score *= 0.4;
    reasons.push("comparison_repeat");
  }

  return { score, reasons };
}

/**
 * Record a used line into repeat history. Call after final selection.
 */
export function recordUsage(
  lineId: string,
  archetype: CommentaryArchetype,
  tone: ToneId,
  resolvedLine: string,
): void {
  const h = getHistory();
  h.lineIds.push(lineId);
  h.archetypes.push(archetype);
  h.tones.push(tone);
  h.openingPhrases.push(extractOpeningPhrase(resolvedLine));
  const comp = extractComparisonPattern(resolvedLine);
  if (comp) h.comparisonPatterns.push(comp);
  saveHistory(h);
}

/** For testing: get history without side effects */
export function getRepeatHistory(): RepeatHistory {
  return getHistory();
}

/** For testing: clear history */
export function clearRepeatHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/antiRepeat.ts
git commit -m "feat(commentary): multi-dimension anti-repeat tracking (lineId, archetype, tone, opening, comparison)"
```

---

### Task 7: Migrate basketball templates to CommentaryLine library format

**Files:**
- Create: `shared/commentary/libraries/basketball.json`

- [ ] **Step 1: Write migration script**

Create a one-time Node script that reads `templateBank.basketball.ts` and converts to the new format:

```ts
// scripts/migrateTemplates.ts — run once, delete after
// Usage: npx tsx scripts/migrateTemplates.ts

import { BASKETBALL_TEMPLATES } from "../shared/commentary/templateBank.basketball";
import type { CommentaryLine, CommentaryLibrary } from "../shared/commentary/types";

// Map old StoryId → new archetype(s)
const STORY_TO_ARCHETYPE: Record<string, string[]> = {
  star_went_off: ["star_carry", "star_carry_big"],
  star_delivered: ["star_delivered"],
  star_quiet_win: ["balanced_win"],
  clean_win: ["balanced_win"],
  star_rare_badge: ["badge_explosion"],
  star_carried_loss: ["star_carried_loss"],
  star_no_showed: ["star_failed"],
  star_cold: ["star_cold"],
  everyone_flat: ["everyone_flat"],
};

const library: CommentaryLibrary = {};
let id = 0;

for (const entry of BASKETBALL_TEMPLATES) {
  const archetypes = STORY_TO_ARCHETYPE[entry.story] ?? [entry.story];
  for (const archetype of archetypes) {
    if (!library[archetype]) library[archetype] = [];
    for (const template of entry.templates) {
      library[archetype].push({
        id: `bk_${String(++id).padStart(4, "0")}`,
        sport: "basketball",
        archetype: archetype as any,
        register: entry.register,
        tone: entry.tone,
        template,
        tags: [],
        humorStyle: [],
        qualityScore: 7,
        enabled: true,
      });
    }
  }
}

// Add new archetype templates that don't exist in the old system
// near_miss
const nearMissLines = [
  { tone: "deadpan", t: "{gap} away from surviving that one. The math was not kind tonight." },
  { tone: "warm", t: "So close. {gap} short of the next level. That one is going to sting for a while." },
  { tone: "culture_wry", t: "{gap} from a completely different conversation. The margins in this game are cruel." },
  { tone: "observational", t: "The gap was {gap}. That is the difference between a loss and a much better night." },
];
library["near_miss"] = nearMissLines.map((l, i) => ({
  id: `bk_nm_${String(i + 1).padStart(3, "0")}`,
  sport: "basketball" as const,
  archetype: "near_miss" as any,
  register: "loss" as const,
  tone: l.tone as any,
  template: l.t,
  tags: ["near_miss"],
  humorStyle: [],
  qualityScore: 7,
  enabled: true,
}));

// ugly_win
const uglyWinLines = [
  { tone: "culture_wry", t: "The roster found a way and nobody is quite sure how. {nick} was not the reason." },
  { tone: "deadpan", t: "A win. Not a pretty one. {last} was quiet but the hand survived it somehow." },
  { tone: "warm", t: "Scraped by without much help from {name}. A win is a win but this one was uncomfortable." },
  { tone: "observational", t: "{last} underproduced but the hand found enough depth to get across the line. Barely." },
];
library["ugly_win"] = uglyWinLines.map((l, i) => ({
  id: `bk_uw_${String(i + 1).padStart(3, "0")}`,
  sport: "basketball" as const,
  archetype: "ugly_win" as any,
  register: "win" as const,
  tone: l.tone as any,
  template: l.t,
  tags: ["ugly_win"],
  humorStyle: [],
  qualityScore: 7,
  enabled: true,
}));

// collapse
const collapseLines = [
  { tone: "deadpan", t: "The streak is done. {gap} short and the whole thing fell apart tonight." },
  { tone: "culture_wry", t: "From a {streak}-game heater to this. The fall was not graceful." },
  { tone: "warm", t: "Tough way to end the run. {gap} short and the streak is over. Reset and rebuild." },
  { tone: "observational", t: "The streak snapped at the worst time. {gap} from surviving and the momentum is gone." },
];
library["collapse"] = collapseLines.map((l, i) => ({
  id: `bk_cl_${String(i + 1).padStart(3, "0")}`,
  sport: "basketball" as const,
  archetype: "collapse" as any,
  register: "loss" as const,
  tone: l.tone as any,
  template: l.t,
  tags: ["collapse", "streak"],
  humorStyle: [],
  qualityScore: 7,
  enabled: true,
}));

// career_night
const careerNightLines = [
  { tone: "hype", t: "{name} just had a career night{opp}. {extremeDescription} That stat line is going in the history books." },
  { tone: "culture_wry", t: "{nick} decided to do something ridiculous tonight{opp}. {extremeDescription} Someone check the stat sheet twice." },
  { tone: "warm", t: "What a night from {name}{opp}. {extremeDescription} This is the kind of performance you tell people about." },
  { tone: "observational", t: "{name} posted a tier 1 stat line tonight{opp}. {extremeDescription} That is rarefied air for any player." },
  { tone: "deadpan", t: "{last} had a historic night{opp}. {extremeDescription} The hand cashed itself." },
];
library["career_night"] = careerNightLines.map((l, i) => ({
  id: `bk_cn_${String(i + 1).padStart(3, "0")}`,
  sport: "basketball" as const,
  archetype: "career_night" as any,
  register: "win" as const,
  tone: l.tone as any,
  template: l.t,
  tags: ["career_night", "extreme"],
  humorStyle: [],
  qualityScore: 8,
  enabled: true,
}));

import fs from "fs";
fs.writeFileSync(
  "shared/commentary/libraries/basketball.json",
  JSON.stringify(library, null, 2),
  "utf8"
);
console.log("Migrated", Object.values(library).flat().length, "lines across", Object.keys(library).length, "archetypes");
```

- [ ] **Step 2: Run migration**

```bash
mkdir -p shared/commentary/libraries
npx tsx scripts/migrateTemplates.ts
```

Expected output: `Migrated ~120 lines across 13 archetypes`

- [ ] **Step 3: Verify library structure**

The JSON should be grouped by archetype:
```json
{
  "star_carry": [ { "id": "bk_0001", ... }, ... ],
  "star_carry_big": [ ... ],
  ...
}
```

- [ ] **Step 4: Commit**

```bash
git add shared/commentary/libraries/basketball.json scripts/migrateTemplates.ts
git commit -m "feat(commentary): migrate basketball templates to CommentaryLine library format"
```

---

### Task 8: Create selectCommentary.ts — the runtime selector

**Files:**
- Create: `shared/commentary/selectCommentary.ts`

- [ ] **Step 1: Create the unified selector**

```ts
/**
 * selectCommentary.ts — Runtime commentary selector.
 *
 * This is the main entry point for the unified commentary engine.
 * Replaces composeCommentary.ts.
 *
 * Flow:
 * 1. Build CommentaryContext from CommentaryInput
 * 2. classifyArchetype (already done, passed in context)
 * 3. inferTone (from toneEngine, secondary to archetype)
 * 4. Filter library by archetype → tone → requires/forbids → enabled
 * 5. Apply anti-repeat penalties
 * 6. Select best candidate
 * 7. Fill template tokens via templateResolver
 * 8. Optionally apply remix for MVP/GOAT
 * 9. Record usage in anti-repeat
 * 10. Return CommentaryResult
 */

import type {
  CommentaryInput,
  CommentaryContext,
  CommentaryLine,
  CommentaryLibrary,
  CommentaryResult,
  CommentaryArchetype,
  ToneId,
  Intensity,
  Register,
  TemplateData,
} from "./types";
import { classifyArchetype } from "./classifyArchetype";
import { selectTone } from "./toneEngine";
import { buildTemplateData, resolveTemplate, composeMessage } from "./templateResolver";
import { scoreRepeatPenalty, recordUsage } from "./antiRepeat";
import { selectStamp } from "./priorities";
import { getFallbackChain } from "./archetypes";
import { selectStar } from "./storySelector";
import { selectStory } from "./storySelector";

// ── Library loader ─────────────────────────────────────────────────────────

let _libraries: Record<string, CommentaryLibrary> = {};

function loadLibrary(sport: string): CommentaryLibrary {
  if (!_libraries[sport]) {
    try {
      if (sport === "basketball") {
        _libraries[sport] = require("./libraries/basketball.json");
      } else if (sport === "baseball") {
        _libraries[sport] = require("./libraries/baseball.json");
      } else {
        _libraries[sport] = {};
      }
    } catch {
      _libraries[sport] = {};
    }
  }
  return _libraries[sport]!;
}

// ── Intensity (reused from composeCommentary) ──────────────────────────────

function determineIntensity(input: CommentaryInput): Intensity {
  const { winTier, totalFp, tierFloor, nextTierMin, isBust } = input;
  const margin = totalFp - (tierFloor ?? 0);
  if (isBust) {
    const gap = (nextTierMin ?? 0) > 0 ? (nextTierMin! - totalFp) : 999;
    if (gap <= 8) return "bust_close";
    if (gap <= 25) return "bust_mid";
    return "bust_bad";
  }
  switch (winTier) {
    case "LEGEND": return "goat";
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

// ── Culture lookup (reused) ────────────────────────────────────────────────

let _cultureDb: Record<string, Record<string, { nicknames?: string[] }>> = {};

function lookupCulture(name: string, sport: string): { nicknames?: string[] } | null {
  if (!_cultureDb[sport]) {
    try {
      if (sport === "baseball") {
        const mod = require("../../baseball/src/utils/playerCulture");
        _cultureDb[sport] = mod.PLAYER_CULTURE ?? {};
      } else {
        const mod = require("../../basketball/src/utils/playerCulture");
        _cultureDb[sport] = mod.PLAYER_CULTURE ?? {};
      }
    } catch { _cultureDb[sport] = {}; }
  }
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  return _cultureDb[sport]![last] ?? null;
}

// ── Seed-based pick ────────────────────────────────────────────────────────

function seededRandom(seed: number, index: number): number {
  const raw = (seed * 9301 + 49297 + index * 7919) % 233280;
  return (raw < 0 ? raw + 233280 : raw) / 233280;
}

// ── Core selector ──────────────────────────────────────────────────────────

export interface SelectCommentaryOptions {
  sport?: string;
}

export function selectCommentary(
  input: CommentaryInput,
  options: SelectCommentaryOptions = {},
): CommentaryResult {
  const sport = options.sport ?? input.sport ?? "basketball";
  const seed = Math.abs(Math.floor(input.totalFp * 13) + input.streak * 7 + (input.isBust ? 3 : 0));

  // Step 1-2: Classify archetype
  const classification = classifyArchetype(input);
  const { archetype, star, starRatio, highestBadge, hasTier1Extreme, nearMiss, deltaToNextTier } = classification;

  // Step 3: Determine intensity and tone (tone is SECONDARY to archetype)
  const intensity = determineIntensity(input);
  const tone = selectTone(intensity, seed);
  const register: Register = input.isBust ? "loss" : "win";

  // Step 4: Get story details for sub-line assembly
  const { details, recordEvents } = selectStory(input, seed, sport);

  // Step 5: Build template data
  const culture = star ? lookupCulture(star.name, sport) : null;
  const templateData = buildTemplateData(star, input, recordEvents, culture);

  // Step 6: Load library and filter candidates
  const library = loadLibrary(sport);
  const fallbackChain = getFallbackChain(archetype);

  let candidates: CommentaryLine[] = [];
  for (const arch of fallbackChain) {
    const pool = library[arch] ?? [];
    // Filter: register match, tone match (or accept any), enabled
    const filtered = pool.filter(line => {
      if (!line.enabled) return false;
      if (line.register !== register) return false;
      if (line.tone !== tone) return false;
      if (line.sport !== "any" && line.sport !== sport) return false;
      return true;
    });
    if (filtered.length > 0) {
      candidates = filtered;
      break;
    }
    // Try without tone constraint (fallback within archetype)
    const anyTone = pool.filter(line => {
      if (!line.enabled) return false;
      if (line.register !== register) return false;
      if (line.sport !== "any" && line.sport !== sport) return false;
      return true;
    });
    if (anyTone.length > 0) {
      candidates = anyTone;
      break;
    }
  }

  // Absolute fallback
  if (candidates.length === 0) {
    const fallbackLine = register === "win" ? "Good hand." : "Tough night.";
    return {
      mainLine: fallbackLine,
      archetype,
      tone,
      lineId: "fallback_static",
    };
  }

  // Step 7: Score candidates with anti-repeat
  const scored = candidates.map((line, i) => {
    const resolved = resolveTemplate(line.template, templateData);
    const penalty = scoreRepeatPenalty(line.id, archetype, tone, resolved);
    const quality = line.qualityScore ?? 7;
    // Combined score: quality * repeat_penalty * small random jitter
    const jitter = 0.9 + seededRandom(seed, i) * 0.2;
    return {
      line,
      resolved,
      score: quality * penalty.score * jitter,
      penalty,
    };
  });

  // Sort by score descending, pick the best
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Step 8: Compose message with details (sub-line)
  const mainLine = composeMessage(best.line.template, templateData, details);

  // Step 9: Stamp
  const stamp = selectStamp(archetype, deltaToNextTier, input.prevStreak);

  // Step 10: Record usage
  recordUsage(best.line.id, archetype, tone, mainLine);

  return {
    mainLine,
    stamp: stamp ?? undefined,
    archetype,
    tone,
    lineId: best.line.id,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/selectCommentary.ts
git commit -m "feat(commentary): unified runtime selector with library filtering and anti-repeat"
```

---

### Task 9: Create remixEngine.ts — curated swap layer

**Files:**
- Create: `shared/commentary/remixEngine.ts`

- [ ] **Step 1: Create the remix engine**

```ts
/**
 * remixEngine.ts — Curated micro-remix for MVP/GOAT hands.
 *
 * STRICTLY LIMITED:
 * - Allowed: verb swap, comparison swap, punctuation tweak
 * - Forbidden: adding new ideas, new clauses, changing narrative meaning
 * - Only applied to MVP/GOAT and career_night/star_carry_big archetypes
 */

import type { CommentaryArchetype, Intensity } from "./types";

/** Archetypes eligible for remix */
const REMIX_ARCHETYPES: Set<CommentaryArchetype> = new Set([
  "star_carry_big",
  "career_night",
  "badge_explosion",
]);

/** Intensities eligible for remix */
const REMIX_INTENSITIES: Set<Intensity> = new Set(["mvp", "goat"]);

/** Verb swap table — source → alternatives */
const VERB_SWAPS: Record<string, string[]> = {
  "dropped": ["posted", "put up", "delivered"],
  "went off": ["erupted", "exploded", "caught fire"],
  "went for": ["put up", "posted", "delivered"],
  "handled business": ["took care of it", "got the job done"],
  "showed up": ["delivered", "brought it", "came through"],
  "carried": ["dragged", "lifted", "shouldered"],
  "cashed": ["hit", "connected", "landed"],
};

/** Comparison swap table */
const COMPARISON_SWAPS: Record<string, string[]> = {
  "like a personal vendetta": ["like it was personal", "with a point to prove"],
  "like it was batting practice": ["like a private workout", "like a scrimmage"],
  "from start to finish": ["wire to wire", "all night long"],
  "rode the wave": ["took the ride", "caught the momentum"],
};

function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/**
 * Apply curated micro-remix to a resolved line.
 * Returns the original line if remix is not applicable or no swaps match.
 */
export function applyRemix(
  line: string,
  archetype: CommentaryArchetype,
  intensity: Intensity,
  seed: number,
): string {
  // Gate: only remix eligible archetypes + intensities
  if (!REMIX_ARCHETYPES.has(archetype) && !REMIX_INTENSITIES.has(intensity)) {
    return line;
  }

  let remixed = line;
  let swapCount = 0;
  const maxSwaps = 1; // Never swap more than 1 element per line

  // Try verb swaps
  for (const [source, alts] of Object.entries(VERB_SWAPS)) {
    if (swapCount >= maxSwaps) break;
    if (remixed.includes(source)) {
      // Only swap ~50% of the time for variety
      if ((seed * 7919) % 100 < 50) {
        remixed = remixed.replace(source, seededPick(alts, seed));
        swapCount++;
      }
      break; // Only attempt one verb swap
    }
  }

  // Try comparison swaps (only if no verb swap was made)
  if (swapCount === 0) {
    for (const [source, alts] of Object.entries(COMPARISON_SWAPS)) {
      if (remixed.includes(source)) {
        if ((seed * 9301) % 100 < 40) {
          remixed = remixed.replace(source, seededPick(alts, seed));
        }
        break;
      }
    }
  }

  return remixed;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/remixEngine.ts
git commit -m "feat(commentary): curated remix engine for MVP/GOAT hands (verb/comparison swaps only)"
```

---

### Task 10: Wire selectCommentary into GameView (basketball)

**Files:**
- Modify: `basketball/src/views/GameView.tsx`

- [ ] **Step 1: Add selectCommentary import alongside existing composeCommentary**

Find the import block (~line 41):
```ts
import { composeCommentary } from "../../../shared/commentary/composeCommentary";
```

Add below it:
```ts
import { selectCommentary } from "../../../shared/commentary/selectCommentary";
```

- [ ] **Step 2: Replace composeCommentary call with selectCommentary**

Find the section (~line 1207) where commentary is composed:
```ts
const copy = USE_NEW_COMMENTARY
  ? composeCommentary(copyInput as any)
  : buildPostRevealCopy(copyInput as any);
```

Replace with:
```ts
const selected = selectCommentary(copyInput as any, { sport: "basketball" });
const copy = selected
  ? { primary: selected.mainLine, secondary: selected.stamp ?? undefined }
  : (USE_NEW_COMMENTARY
    ? composeCommentary(copyInput as any)
    : buildPostRevealCopy(copyInput as any));
```

This uses `selectCommentary` as primary, falls back to the old system if it returns the static fallback.

- [ ] **Step 3: Commit**

```bash
git add basketball/src/views/GameView.tsx
git commit -m "feat(basketball): wire selectCommentary as primary commentary source with legacy fallback"
```

---

### Task 11: Move legacy files

**Files:**
- Move: `shared/commentary/composeCommentary.ts` → `shared/commentary/legacy/composeCommentary.ts`
- Move: `shared/commentary/storySelector.ts` stays (still used by classifyArchetype and selectCommentary for selectStar/selectStory)
- Keep: All template banks stay (used by migration and as fallback)

- [ ] **Step 1: Create legacy directory and move composeCommentary**

```bash
mkdir -p shared/commentary/legacy
```

Do NOT move yet — `composeCommentary` is still imported as fallback. Instead, add a deprecation comment:

Add to top of `shared/commentary/composeCommentary.ts`:
```ts
/** @deprecated Use selectCommentary.ts instead. Kept as fallback during migration. */
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/composeCommentary.ts
git commit -m "chore(commentary): mark composeCommentary as deprecated, selectCommentary is primary"
```

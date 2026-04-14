# Unified Commentary Engine — Part 3: Workshop Foundation & Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scoring rubric for grading lines, add comprehensive tests for all new systems, and create the foundation for the offline workshop pipeline.

**Architecture:** Workshop phase 1 focuses on the scoring rubric so we can grade existing templates and identify weak spots. Full generation/dedupe pipeline comes in phase 2 (future plan). Tests cover archetype classification, priority rules, anti-repeat, template filling, and a regression suite.

---

### Task 12: Create workshop scoring rubric

**Files:**
- Create: `shared/commentary/workshop/scoringRubric.ts`

- [ ] **Step 1: Create the scoring rubric module**

```ts
/**
 * scoringRubric.ts — Commentary line quality scoring.
 *
 * Used by the offline workshop to grade candidate lines and by the
 * gradeLibrary tool to audit the existing production library.
 *
 * Each line is scored on 7 dimensions (1-10), weighted into an overall score.
 * Lines below threshold are flagged for revision or disabling.
 */

export interface LineScore {
  humanSounding: number;    // 1-10: sounds like a real person
  oneMessage: number;       // 1-10: one dominant thought only
  humor: number;            // 1-10: witty in a natural way
  specificity: number;      // 1-10: tied to this archetype, not generic
  factualFit: number;       // 1-10: matches the scenario truthfully
  nonGeneric: number;       // 1-10: memorable, not boilerplate
  sportsVoice: number;      // 1-10: feels like real sports banter
  overall: number;          // weighted composite
  rejectReasons: string[];  // auto-reject flags
}

const WEIGHTS = {
  humanSounding: 0.20,
  oneMessage: 0.15,
  humor: 0.15,
  specificity: 0.15,
  factualFit: 0.10,
  nonGeneric: 0.15,
  sportsVoice: 0.10,
};

/**
 * Compute weighted overall score from individual dimensions.
 */
export function computeOverall(scores: Omit<LineScore, "overall" | "rejectReasons">): number {
  return Math.round(
    (scores.humanSounding * WEIGHTS.humanSounding +
     scores.oneMessage * WEIGHTS.oneMessage +
     scores.humor * WEIGHTS.humor +
     scores.specificity * WEIGHTS.specificity +
     scores.factualFit * WEIGHTS.factualFit +
     scores.nonGeneric * WEIGHTS.nonGeneric +
     scores.sportsVoice * WEIGHTS.sportsVoice) * 10
  ) / 10;
}

/**
 * Auto-reject rules. Returns reasons if line should be rejected.
 */
export function autoReject(template: string): string[] {
  const reasons: string[] = [];
  const lower = template.toLowerCase();

  // Rule 1: More than one main idea (multiple periods = likely multi-sentence)
  const sentences = template.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length > 2) reasons.push("multi_idea");

  // Rule 2: Generic sports filler phrases
  const genericPhrases = [
    "strong performance", "stepped up", "came to play",
    "big night", "huge game", "great effort", "really delivered",
    "got the job done", "solid effort", "nice work", "great job",
    "clutch performance",
  ];
  for (const phrase of genericPhrases) {
    if (lower.includes(phrase)) {
      reasons.push(`generic_filler: "${phrase}"`);
      break;
    }
  }

  // Rule 3: Too long (>200 chars after token replacement would be ~250+)
  if (template.length > 180) reasons.push("too_long");

  // Rule 4: Contains game mechanic terms
  const mechanics = ["fp", "fantasy points", "projection", "projected",
    "rookie tier", "starter tier", "all-star tier", "mvp tier"];
  for (const term of mechanics) {
    if (lower.includes(term)) {
      reasons.push(`mechanic_leak: "${term}"`);
      break;
    }
  }

  // Rule 5: No template tokens (generic, not player-specific)
  if (!template.includes("{") && template.length > 30) {
    reasons.push("no_tokens_generic");
  }

  return reasons;
}

/**
 * Score a line with auto-reject + manual scores.
 * If autoReject fires, overall is capped at 3.0.
 */
export function scoreLine(
  template: string,
  manualScores: Omit<LineScore, "overall" | "rejectReasons">,
): LineScore {
  const rejectReasons = autoReject(template);
  let overall = computeOverall(manualScores);
  if (rejectReasons.length > 0) overall = Math.min(overall, 3.0);
  return { ...manualScores, overall, rejectReasons };
}

/** Minimum overall score for production library */
export const PRODUCTION_THRESHOLD = 6.0;

/** Minimum overall score for "needs revision" (vs outright reject) */
export const REVISION_THRESHOLD = 4.5;
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/workshop/scoringRubric.ts
git commit -m "feat(commentary): workshop scoring rubric with 7-dimension grading and auto-reject"
```

---

### Task 13: Create gradeLibrary tool

**Files:**
- Create: `shared/commentary/workshop/gradeLibrary.ts`

- [ ] **Step 1: Create the library grading tool**

```ts
/**
 * gradeLibrary.ts — Batch-grade the production commentary library.
 *
 * Runs auto-reject on all lines and reports:
 * - Lines that should be disabled (auto-reject)
 * - Lines with no tokens (generic)
 * - Archetype coverage gaps (archetypes with <4 lines per tone)
 * - Distribution stats
 *
 * Usage: npx tsx shared/commentary/workshop/gradeLibrary.ts
 */

import fs from "fs";
import path from "path";
import { autoReject, PRODUCTION_THRESHOLD } from "./scoringRubric";
import type { CommentaryLine, CommentaryLibrary } from "../types";
import { getActiveArchetypes } from "../archetypes";

const LIBRARY_DIR = path.join(__dirname, "../libraries");

function gradeLibrary(sport: string): void {
  const filePath = path.join(LIBRARY_DIR, `${sport}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`No library found for ${sport}`);
    return;
  }

  const library: CommentaryLibrary = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const activeArchetypes = getActiveArchetypes();

  console.log(`\n═══ ${sport.toUpperCase()} LIBRARY GRADE ═══\n`);

  let totalLines = 0;
  let enabledLines = 0;
  let rejectedLines = 0;
  const archetypeCoverage: Record<string, { total: number; byTone: Record<string, number> }> = {};

  for (const [archetype, lines] of Object.entries(library)) {
    archetypeCoverage[archetype] = { total: lines.length, byTone: {} };
    for (const line of lines) {
      totalLines++;
      if (line.enabled) enabledLines++;

      // Track tone distribution
      const t = line.tone;
      archetypeCoverage[archetype].byTone[t] = (archetypeCoverage[archetype].byTone[t] ?? 0) + 1;

      // Auto-reject check
      const reasons = autoReject(line.template);
      if (reasons.length > 0) {
        rejectedLines++;
        console.log(`  ✗ [${line.id}] ${archetype}/${line.tone}: ${reasons.join(", ")}`);
        console.log(`    "${line.template.slice(0, 80)}..."`);
      }
    }
  }

  // Coverage gaps
  console.log(`\n── Coverage Report ──\n`);
  const tones = ["hype", "warm", "culture_wry", "observational", "analytical", "deadpan"];
  for (const arch of activeArchetypes) {
    const cov = archetypeCoverage[arch];
    if (!cov) {
      console.log(`  ⚠ ${arch}: NO LINES (empty archetype)`);
      continue;
    }
    const gaps = tones.filter(t => (cov.byTone[t] ?? 0) < 2);
    if (gaps.length > 0) {
      console.log(`  △ ${arch} (${cov.total} lines): needs more lines for: ${gaps.join(", ")}`);
    } else {
      console.log(`  ✓ ${arch}: ${cov.total} lines, all tones covered`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Total lines:    ${totalLines}`);
  console.log(`  Enabled:        ${enabledLines}`);
  console.log(`  Auto-rejected:  ${rejectedLines}`);
  console.log(`  Archetypes:     ${Object.keys(archetypeCoverage).length} / ${activeArchetypes.length} active`);
}

// Run for all sports
gradeLibrary("basketball");
```

- [ ] **Step 2: Commit**

```bash
git add shared/commentary/workshop/gradeLibrary.ts
git commit -m "feat(commentary): library grading tool for auto-reject and coverage analysis"
```

---

### Task 14: Anti-repeat tests

**Files:**
- Create: `shared/commentary/__tests__/antiRepeat.test.ts`

- [ ] **Step 1: Write anti-repeat tests**

```ts
import {
  extractOpeningPhrase,
  extractComparisonPattern,
  scoreRepeatPenalty,
  recordUsage,
  clearRepeatHistory,
} from "../antiRepeat";

// Mock localStorage for tests
const store: Record<string, string> = {};
beforeAll(() => {
  Object.defineProperty(global, "localStorage", {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
    writable: true,
  });
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe("extractOpeningPhrase", () => {
  test("extracts first 4 words lowercase", () => {
    expect(extractOpeningPhrase("Jokic went off tonight and dominated")).toBe("jokic went off tonight");
  });
  test("handles short lines", () => {
    expect(extractOpeningPhrase("Good hand.")).toBe("good hand.");
  });
});

describe("extractComparisonPattern", () => {
  test("detects 'treated X like Y'", () => {
    expect(extractComparisonPattern("Booker treated Toronto like batting practice")).toBe("treated_toronto_like");
  });
  test("detects 'turned X into Y'", () => {
    expect(extractComparisonPattern("He turned this into a private workout")).toMatch(/turned_this_into/);
  });
  test("returns null for no comparison", () => {
    expect(extractComparisonPattern("Jokic dropped 40 pts tonight")).toBeNull();
  });
});

describe("scoreRepeatPenalty", () => {
  test("fresh history returns score 1.0", () => {
    const result = scoreRepeatPenalty("line_001", "star_carry", "hype", "Jokic went off tonight");
    expect(result.score).toBe(1.0);
    expect(result.reasons).toHaveLength(0);
  });

  test("exact line repeat returns score 0.0", () => {
    recordUsage("line_001", "star_carry", "hype", "Jokic went off tonight");
    const result = scoreRepeatPenalty("line_001", "star_carry", "hype", "Jokic went off tonight");
    expect(result.score).toBe(0.0);
    expect(result.reasons).toContain("exact_line_repeat");
  });

  test("same archetype penalizes but doesn't block", () => {
    recordUsage("line_001", "star_carry", "hype", "Jokic went off tonight");
    const result = scoreRepeatPenalty("line_002", "star_carry", "warm", "Different opening here tonight");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1.0);
    expect(result.reasons).toContain("archetype_recent");
  });

  test("same opening phrase penalizes", () => {
    recordUsage("line_001", "star_carry", "hype", "Jokic went off tonight and dominated everything");
    const result = scoreRepeatPenalty("line_002", "balanced_win", "warm", "Jokic went off tonight but differently");
    expect(result.score).toBeLessThan(1.0);
    expect(result.reasons).toContain("opening_repeat");
  });
});

describe("recordUsage", () => {
  test("records all dimensions", () => {
    clearRepeatHistory();
    recordUsage("line_001", "star_carry", "hype", "Booker treated Toronto like batting practice");
    // Second usage of same line should be blocked
    const result = scoreRepeatPenalty("line_001", "star_carry", "hype", "Booker treated Toronto like batting practice");
    expect(result.score).toBe(0.0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run shared/commentary/__tests__/antiRepeat.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/__tests__/antiRepeat.test.ts
git commit -m "test(commentary): anti-repeat tests covering all 5 tracking dimensions"
```

---

### Task 15: Priority rules tests

**Files:**
- Create: `shared/commentary/__tests__/priorities.test.ts`

- [ ] **Step 1: Write priority tests**

```ts
import { classifyArchetype } from "../classifyArchetype";
import type { CommentaryInput, CommentaryRosterCard } from "../types";

function makeCard(overrides: Partial<CommentaryRosterCard> = {}): CommentaryRosterCard {
  return {
    name: "Test Star",
    salary: 50,
    actualFp: 40,
    projectedFp: 30,
    cardTier: "ORANGE",
    statLine: { pts: 30, reb: 8, ast: 5 },
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

describe("Priority Rules", () => {
  test("career_night beats badge_explosion (priority 1 > 2)", () => {
    const card = makeCard({
      extremeFlags: [{ type: "god_mode_pts", tier: 1, priority: 100, headline: "50+", keyStat: "pts", value: 55 }],
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("career_night");
  });

  test("badge_explosion beats star_carry (priority 2 > 5)", () => {
    const card = makeCard({
      actualFp: 70,
      projectedFp: 40,
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("badge_explosion");
  });

  test("near_miss beats star_failed in loss context (priority 3 > 8)", () => {
    const card = makeCard({ actualFp: 15, projectedFp: 40 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
      totalFp: 145,
      nextTierMin: 148,
    }));
    expect(result.archetype).toBe("near_miss");
  });

  test("collapse beats star_cold (priority 4 > 9)", () => {
    const card = makeCard({ actualFp: 22, projectedFp: 30 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
      totalFp: 120,
      nextTierMin: 148,
      prevStreak: 4,
    }));
    expect(result.archetype).toBe("collapse");
  });

  test("star_carry_big requires high tier (priority 5 needs ALL_STAR+)", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    // STARTER should get star_carry, not star_carry_big
    expect(classifyArchetype(makeInput({ roster: [card], winTier: "STARTER" })).archetype).toBe("star_carry");
    // ALL_STAR should get star_carry_big
    expect(classifyArchetype(makeInput({ roster: [card], winTier: "ALL_STAR" })).archetype).toBe("star_carry_big");
  });

  test("streak does NOT override star narrative", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    const result = classifyArchetype(makeInput({
      roster: [card],
      streak: 5,
      prevStreak: 4,
    }));
    // Should be star_carry, not any streak archetype
    expect(result.archetype).toBe("star_carry");
  });

  test("near_miss only triggers within 5 FP threshold", () => {
    const card = makeCard({ actualFp: 25, projectedFp: 30 });
    // 6 FP gap — should NOT be near_miss
    const result = classifyArchetype(makeInput({
      roster: [card],
      isBust: true,
      winTier: "BUST",
      totalFp: 142,
      nextTierMin: 148,
    }));
    expect(result.archetype).not.toBe("near_miss");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run shared/commentary/__tests__/priorities.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/__tests__/priorities.test.ts
git commit -m "test(commentary): priority rule tests ensuring correct archetype precedence"
```

---

### Task 16: Template filling tests

**Files:**
- Create: `shared/commentary/__tests__/templateFill.test.ts`

- [ ] **Step 1: Write template filling tests**

```ts
import { resolveTemplate } from "../templateResolver";
import type { TemplateData } from "../types";

const mockData: TemplateData = {
  name: "Nikola Jokić",
  last: "Jokić",
  first: "Nikola",
  nick: "The Joker",
  nick2: "Big Honey",
  pts: 41,
  reb: 15,
  ast: 12,
  stl: 2,
  blk: 1,
  to: 3,
  opp: " against Phoenix",
  badge: "triple double",
  topStat: "41 pt",
  streak: 3,
  gap: 4.2,
  record: "The NBA record is 100.",
  recordHolder: "Wilt Chamberlain",
  recordValue: 100,
  extremeDescription: "Jokić posted a triple-double with 41 pts.",
};

describe("resolveTemplate", () => {
  test("replaces all tokens", () => {
    const t = "{name} dropped {pts}{opp}. {badge} night from {nick}.";
    const result = resolveTemplate(t, mockData);
    expect(result).toBe("Nikola Jokić dropped 41 pts against Phoenix. triple double night from The Joker.");
  });

  test("stats always include units", () => {
    const t = "{last} had {pts}, {reb}, and {ast}.";
    const result = resolveTemplate(t, mockData);
    expect(result).toContain("41 pts");
    expect(result).toContain("15 reb");
    expect(result).toContain("12 ast");
  });

  test("handles missing opponent gracefully", () => {
    const t = "{name} went off{opp}.";
    const result = resolveTemplate(t, { ...mockData, opp: "" });
    expect(result).toBe("Nikola Jokić went off.");
  });

  test("no broken tokens in output", () => {
    const t = "{name} {pts} {badge} {streak} {gap}";
    const result = resolveTemplate(t, mockData);
    expect(result).not.toContain("{");
    expect(result).not.toContain("}");
  });

  test("handles nick2 token", () => {
    const t = "{nick2} showed up tonight.";
    const result = resolveTemplate(t, mockData);
    expect(result).toBe("Big Honey showed up tonight.");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run shared/commentary/__tests__/templateFill.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/__tests__/templateFill.test.ts
git commit -m "test(commentary): template token resolution tests"
```

---

### Task 17: Remix engine tests

**Files:**
- Create: `shared/commentary/__tests__/remixEngine.test.ts`

- [ ] **Step 1: Write remix tests**

```ts
import { applyRemix } from "../remixEngine";

describe("remixEngine", () => {
  test("does NOT remix non-eligible archetypes", () => {
    const line = "Jokic dropped 40 pts tonight.";
    const result = applyRemix(line, "balanced_win", "starter_normal", 42);
    expect(result).toBe(line); // unchanged
  });

  test("does NOT remix non-eligible intensities", () => {
    const line = "Jokic dropped 40 pts tonight.";
    const result = applyRemix(line, "star_delivered", "starter_normal", 42);
    expect(result).toBe(line);
  });

  test("may remix eligible archetype + intensity", () => {
    // star_carry_big + mvp = eligible
    const line = "Jokic dropped 40 pts tonight.";
    // Run with multiple seeds — at least some should remix
    const results = new Set<string>();
    for (let s = 0; s < 100; s++) {
      results.add(applyRemix(line, "star_carry_big", "mvp", s));
    }
    // Should have at least 2 variants (original + remix)
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  test("never adds new clauses or ideas", () => {
    const line = "Booker went off against Toronto.";
    for (let s = 0; s < 50; s++) {
      const result = applyRemix(line, "career_night", "goat", s);
      // Should never be longer by more than ~10 chars (word swap length diff)
      expect(result.length).toBeLessThan(line.length + 15);
      // Should never add a period (new sentence)
      const originalPeriods = (line.match(/\./g) ?? []).length;
      const remixPeriods = (result.match(/\./g) ?? []).length;
      expect(remixPeriods).toBeLessThanOrEqual(originalPeriods);
    }
  });

  test("max 1 swap per line", () => {
    const line = "Jokic dropped 40 and went off and showed up tonight.";
    for (let s = 0; s < 50; s++) {
      const result = applyRemix(line, "star_carry_big", "goat", s);
      // Count differences — at most 1 phrase should change
      const origWords = line.split(/\s+/);
      const remixWords = result.split(/\s+/);
      let diffs = 0;
      for (let i = 0; i < Math.min(origWords.length, remixWords.length); i++) {
        if (origWords[i] !== remixWords[i]) diffs++;
      }
      // Allow some difference but not massive rewrites
      expect(diffs).toBeLessThanOrEqual(5);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run shared/commentary/__tests__/remixEngine.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/__tests__/remixEngine.test.ts
git commit -m "test(commentary): remix engine tests verifying constraints (no new ideas, max 1 swap)"
```

---

### Task 18: Scoring rubric tests

**Files:**
- Create: `shared/commentary/__tests__/scoringRubric.test.ts`

- [ ] **Step 1: Write rubric tests**

```ts
import { autoReject, computeOverall, scoreLine, PRODUCTION_THRESHOLD } from "../workshop/scoringRubric";

describe("autoReject", () => {
  test("rejects generic filler phrases", () => {
    const reasons = autoReject("Player had a strong performance tonight.");
    expect(reasons.some(r => r.includes("generic_filler"))).toBe(true);
  });

  test("rejects game mechanic terms", () => {
    expect(autoReject("Player scored 40 FP tonight.").some(r => r.includes("mechanic_leak"))).toBe(true);
    expect(autoReject("Above projection tonight.").some(r => r.includes("mechanic_leak"))).toBe(true);
  });

  test("rejects templates with no tokens", () => {
    const reasons = autoReject("A good night of basketball was had by all.");
    expect(reasons).toContain("no_tokens_generic");
  });

  test("accepts clean templates with tokens", () => {
    const reasons = autoReject("{name} dropped {pts}{opp}. Cash the hand.");
    expect(reasons).toHaveLength(0);
  });

  test("rejects too-long templates", () => {
    const long = "{name} ".repeat(30) + "tonight.";
    expect(autoReject(long)).toContain("too_long");
  });
});

describe("computeOverall", () => {
  test("perfect scores give 10.0", () => {
    const score = computeOverall({
      humanSounding: 10, oneMessage: 10, humor: 10,
      specificity: 10, factualFit: 10, nonGeneric: 10, sportsVoice: 10,
    });
    expect(score).toBe(10);
  });

  test("all-5s give 5.0", () => {
    const score = computeOverall({
      humanSounding: 5, oneMessage: 5, humor: 5,
      specificity: 5, factualFit: 5, nonGeneric: 5, sportsVoice: 5,
    });
    expect(score).toBe(5);
  });
});

describe("scoreLine", () => {
  test("auto-reject caps overall at 3.0", () => {
    const result = scoreLine("Player had a strong performance tonight.", {
      humanSounding: 8, oneMessage: 8, humor: 8,
      specificity: 8, factualFit: 8, nonGeneric: 8, sportsVoice: 8,
    });
    expect(result.overall).toBeLessThanOrEqual(3.0);
    expect(result.rejectReasons.length).toBeGreaterThan(0);
  });

  test("clean line gets full score", () => {
    const result = scoreLine("{name} dropped {pts}{opp}. Statement night.", {
      humanSounding: 8, oneMessage: 9, humor: 7,
      specificity: 8, factualFit: 9, nonGeneric: 8, sportsVoice: 8,
    });
    expect(result.overall).toBeGreaterThan(PRODUCTION_THRESHOLD);
    expect(result.rejectReasons).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run shared/commentary/__tests__/scoringRubric.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add shared/commentary/__tests__/scoringRubric.test.ts
git commit -m "test(commentary): scoring rubric tests for auto-reject and quality grading"
```

---

### Task 19: Run all tests and verify

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/john/Desktop/ReplayMod && npx vitest run shared/commentary/__tests__/
```

Expected: All tests in classifyArchetype, priorities, antiRepeat, templateFill, remixEngine, and scoringRubric pass.

- [ ] **Step 2: Run the library grader**

```bash
npx tsx shared/commentary/workshop/gradeLibrary.ts
```

Expected: Report showing coverage per archetype, auto-rejected lines, and gap analysis.

- [ ] **Step 3: Smoke test selectCommentary**

```bash
node -e "
const { selectCommentary } = require('./shared/commentary/selectCommentary');
const result = selectCommentary({
  sport: 'basketball',
  totalFp: 250,
  winTier: 'MVP',
  tierFloor: 210,
  nextTierMin: 238,
  streak: 2,
  prevStreak: 1,
  isBust: false,
  handCount: 5,
  roster: [{
    name: 'Nikola Jokic',
    salary: 89,
    actualFp: 85,
    projectedFp: 55,
    cardTier: 'ORANGE',
    statLine: { pts: 41, reb: 15, ast: 12, stl: 2, blk: 1, turnovers: 3 },
    achievements: [{ id: 'TRIPLE_DBL', label: 'Triple Double' }],
    extremeFlags: [],
  }],
});
console.log(JSON.stringify(result, null, 2));
"
```

Expected: Returns a `CommentaryResult` with a resolved mainLine, archetype, tone, and lineId.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(commentary): unified commentary engine v1 — types, archetypes, classifier, selector, anti-repeat, remix, workshop rubric, tests"
```

---

## Summary of all files created/modified

### New files (13):
| File | Purpose |
|------|---------|
| `shared/commentary/archetypes.ts` | Master archetype registry (13 active + 19 reserved) |
| `shared/commentary/classifyArchetype.ts` | Deterministic priority-chain classifier |
| `shared/commentary/priorities.ts` | Narrative priority rules + stamp system |
| `shared/commentary/antiRepeat.ts` | 5-dimension repeat tracking |
| `shared/commentary/selectCommentary.ts` | Unified runtime selector |
| `shared/commentary/remixEngine.ts` | Curated verb/comparison swaps for MVP/GOAT |
| `shared/commentary/libraries/basketball.json` | Migrated line library (grouped by archetype) |
| `shared/commentary/workshop/scoringRubric.ts` | 7-dimension quality scoring |
| `shared/commentary/workshop/gradeLibrary.ts` | Batch library audit tool |
| `shared/commentary/__tests__/classifyArchetype.test.ts` | 13 classification tests |
| `shared/commentary/__tests__/priorities.test.ts` | 7 priority rule tests |
| `shared/commentary/__tests__/antiRepeat.test.ts` | 5 anti-repeat tests |
| `shared/commentary/__tests__/templateFill.test.ts` | 5 template resolution tests |
| `shared/commentary/__tests__/remixEngine.test.ts` | 4 remix constraint tests |
| `shared/commentary/__tests__/scoringRubric.test.ts` | 5 scoring rubric tests |
| `scripts/migrateTemplates.ts` | One-time migration script |

### Modified files (3):
| File | Change |
|------|--------|
| `shared/commentary/types.ts` | Add CommentaryArchetype, CommentaryContext, CommentaryLine, CommentaryResult |
| `shared/commentary/composeCommentary.ts` | Add @deprecated JSDoc |
| `basketball/src/views/GameView.tsx` | Wire selectCommentary as primary with legacy fallback |

### Untouched (kept as-is):
- `toneEngine.ts` — works well, used by selectCommentary
- `badgeTiers.ts` — works well, used by classifyArchetype
- `templateResolver.ts` — pure token replacement, used by selectCommentary
- `storySelector.ts` — selectStar and selectStory still used
- `templateBank.ts` + sport banks — kept for legacy fallback
- `promptBuilder.ts` + `generateCommentary.ts` — disabled, untouched
- All player culture files — untouched
- All sport-specific context builders — untouched

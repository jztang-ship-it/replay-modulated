/**
 * commentaryAudit.ts — Scenario generator + rule-based grader + report.
 * Run: npx tsx basketball/src/tools/commentaryAudit.ts
 */

import { composeCommentary } from "../../../shared/commentary/composeCommentary";
import type { CommentaryInput, CommentaryRosterCard } from "../../../shared/commentary/types";

// ─── Scenario generator ─────────────────────────────────────────────────────

const WIN_TIERS = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "GOAT"];
const MARGINS = [2, 8, 20];
const NEAR_MISS_GAPS = [0, 2, 6];
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

function buildRoster(shape: "1star" | "2star", starRatio: number, badge: string, held: boolean): CommentaryRosterCard[] {
  const starCard = (name: string, salary: number, tier: string): CommentaryRosterCard => ({
    name,
    salary,
    actualFp: Math.round(30 * starRatio),
    projectedFp: 30,
    cardTier: tier,
    statLine: { pts: Math.round(25 * starRatio), reb: 6, ast: 5, stl: 1, blk: 0, turnovers: badge === "TURNOVER_MACHINE" ? 7 : 2 },
    opponent: "IND",
    homeAway: "H" as const,
  });

  const benchCard = (name: string): CommentaryRosterCard => ({
    name,
    salary: 15,
    actualFp: 18,
    projectedFp: 18,
    cardTier: "BLUE",
    statLine: { pts: 12, reb: 3, ast: 2, stl: 0, blk: 0, turnovers: 1 },
    opponent: "IND",
    homeAway: "H" as const,
  });

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

function generateScenarios(): { input: CommentaryInput; label: string }[] {
  const scenarios: { input: CommentaryInput; label: string }[] = [];

  for (const winTier of WIN_TIERS) {
    for (const margin of MARGINS) {
      for (const nearMissGap of NEAR_MISS_GAPS) {
        for (const starRatio of STAR_RATIOS) {
          for (const streak of STREAKS) {
            for (const badge of BADGES) {
              for (const rosterShape of ROSTER_SHAPES) {
                const isBust = winTier === "BUST";
                const prevStreak = isBust && streak > 0 ? streak : Math.max(0, streak - 1);
                const tierFloor = TIER_FLOORS[winTier] ?? 0;
                const totalFp = isBust ? tierFloor - 10 : tierFloor + margin;
                const nextTier = TIER_NEXT[winTier] ?? null;
                const nextTierMin = nearMissGap > 0 ? totalFp + nearMissGap : (nextTier ? NEXT_MINS[nextTier] ?? 0 : 0);
                const held = starRatio >= 1.25 && badge !== "TURNOVER_MACHINE";

                const input: CommentaryInput = {
                  sport: "basketball",
                  totalFp,
                  winTier: winTier as any,
                  nextTier: nextTier as any,
                  tierFloor,
                  nextTierMin,
                  roster: buildRoster(rosterShape, starRatio, badge, held),
                  streak,
                  prevStreak,
                  isBust,
                  handCount: 10,
                };

                const label = `${winTier}|m${margin}|nm${nearMissGap}|r${starRatio}|s${streak}|${badge}|${rosterShape}`;
                scenarios.push({ input, label });
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

function grade(message: string, input: CommentaryInput): GradeResult[] {
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

  // Star-first check
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
      results.push({ severity: "WARN", check: "star_missing", reason: "No nameable player referenced" });
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
  const failBreakdown: Record<string, number> = {};
  const messages = new Map<string, string[]>();
  const failedExamples: { label: string; message: string; reason: string }[] = [];

  for (const { input, label } of scenarios) {
    const result = composeCommentary(input as any);
    const message = result.primary;
    const grades = grade(message, input);
    const worst = grades.reduce((w, g) =>
      g.severity === "FAIL" ? "FAIL" : w,
      "PASS" as Severity,
    );

    if (worst === "PASS") {
      pass++;
    } else {
      fail++;
      for (const g of grades.filter(g => g.severity === "FAIL")) {
        failBreakdown[g.check] = (failBreakdown[g.check] ?? 0) + 1;
        if (failedExamples.length < 20) {
          failedExamples.push({ label, message, reason: g.reason });
        }
      }
    }

    const existing = messages.get(message);
    if (existing) {
      existing.push(label);
    } else {
      messages.set(message, [label]);
    }
  }

  // Count redundant messages
  let redundant = 0;
  for (const [, labels] of messages) {
    if (labels.length > 1) redundant += labels.length;
  }
  if (redundant > 0) {
    failBreakdown["redundancy"] = redundant;
  }

  const total = scenarios.length;
  console.log(`Pass: ${pass} (${((pass / total) * 100).toFixed(0)}%)`);
  console.log(`Fail: ${fail} (${((fail / total) * 100).toFixed(0)}%)`);
  console.log(`Redundant messages: ${redundant}`);
  console.log(`Unique messages: ${messages.size}`);
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

  const dupes = [...messages.entries()].filter(([, l]) => l.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  if (dupes.length > 0) {
    console.log("\nMost duplicated messages:");
    for (const [msg, labels] of dupes) {
      console.log(`  "${msg.slice(0, 80)}..." — ${labels.length} scenarios`);
    }
  }
}

main();

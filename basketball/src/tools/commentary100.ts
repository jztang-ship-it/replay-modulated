/**
 * commentary100.ts — Run 100 diverse scenarios and print results.
 * Run: npx tsx basketball/src/tools/commentary100.ts
 */

import { composeCommentary } from "../../../shared/commentary/composeCommentary";
import type { CommentaryInput, CommentaryRosterCard } from "../../../shared/commentary/types";

// Mock localStorage
const storage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
};

// ─── Real-ish player names and tiers ────────────────────────────────────────

const STARS: { name: string; salary: number; tier: string }[] = [
  { name: "Anthony Edwards", salary: 62, tier: "ORANGE" },
  { name: "Nikola Jokic", salary: 89, tier: "ORANGE" },
  { name: "Giannis Antetokounmpo", salary: 79, tier: "ORANGE" },
  { name: "Jayson Tatum", salary: 72, tier: "ORANGE" },
  { name: "Luka Doncic", salary: 85, tier: "ORANGE" },
  { name: "Trae Young", salary: 55, tier: "PURPLE" },
  { name: "Devin Booker", salary: 58, tier: "PURPLE" },
  { name: "LeBron James", salary: 65, tier: "ORANGE" },
  { name: "Kevin Durant", salary: 68, tier: "ORANGE" },
  { name: "Shai Gilgeous-Alexander", salary: 75, tier: "ORANGE" },
];

const BENCH = [
  { name: "Marcus Smart", salary: 18, tier: "BLUE" },
  { name: "Bobby Portis", salary: 15, tier: "GREEN" },
  { name: "Malik Beasley", salary: 12, tier: "WHITE" },
  { name: "Jalen Smith", salary: 10, tier: "WHITE" },
];

const OPPONENTS = ["BOS", "LAL", "GSW", "MIA", "PHX", "CHI", "NYK", "DEN", "DAL", "MIL"];

const TIER_FLOORS: Record<string, number> = {
  BUST: 0, ROOKIE: 190, STARTER: 205, ALL_STAR: 225, MVP: 235, LEGEND: 250,
};

// ─── Scenario builder ───────────────────────────────────────────────────────

interface Scenario {
  winTier: string;
  totalFp: number;
  starName: string;
  starRatio: number;
  streak: number;
  opponent: string;
  badge: string;
}

function buildInput(s: Scenario): CommentaryInput {
  const isBust = s.winTier === "BUST";
  const tierFloor = TIER_FLOORS[s.winTier] ?? 0;
  const star = STARS.find(p => p.name === s.starName) ?? STARS[0];
  const opp = s.opponent;
  const projectedFp = 30;

  const roster: CommentaryRosterCard[] = [
    {
      name: star.name,
      salary: star.salary,
      actualFp: Math.round(projectedFp * s.starRatio),
      projectedFp,
      cardTier: star.tier,
      statLine: {
        pts: Math.round(22 * s.starRatio),
        reb: Math.round(6 * (0.8 + Math.random() * 0.4)),
        ast: Math.round(5 * (0.8 + Math.random() * 0.4)),
        stl: Math.round(Math.random() * 3),
        blk: Math.round(Math.random() * 2),
        turnovers: s.badge === "TURNOVER_MACHINE" ? 7 : Math.round(Math.random() * 3),
      },
      opponent: opp,
      homeAway: Math.random() > 0.5 ? "H" : "A",
    },
    ...BENCH.map(b => ({
      name: b.name,
      salary: b.salary,
      actualFp: Math.round(15 + Math.random() * 10),
      projectedFp: 18,
      cardTier: b.tier,
      statLine: { pts: Math.round(8 + Math.random() * 8), reb: 3, ast: 2, stl: 0, blk: 0, turnovers: 1 },
      opponent: opp,
      homeAway: "H" as const,
    })),
  ];

  const nextTierMap: Record<string, string | null> = {
    BUST: "ROOKIE", ROOKIE: "STARTER", STARTER: "ALL_STAR", ALL_STAR: "MVP", MVP: "LEGEND", LEGEND: null,
  };
  const nextTier = nextTierMap[s.winTier] ?? null;
  const nextMin = nextTier ? (TIER_FLOORS[nextTier] ?? 999) : 0;

  return {
    sport: "basketball",
    totalFp: s.totalFp,
    winTier: s.winTier as any,
    nextTier: nextTier as any,
    tierFloor,
    nextTierMin: nextMin,
    roster,
    streak: s.streak,
    prevStreak: isBust && s.streak > 0 ? s.streak : Math.max(0, s.streak - 1),
    isBust,
    handCount: 10,
  };
}

// ─── Generate 100 diverse scenarios ─────────────────────────────────────────

function generate100(): Scenario[] {
  const scenarios: Scenario[] = [];
  const tiers = ["BUST", "BUST", "ROOKIE", "STARTER", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const ratios = [0.4, 0.6, 0.75, 0.9, 1.0, 1.1, 1.3, 1.5, 1.8, 2.0];
  const streaks = [0, 0, 0, 1, 2, 3, 5, 7, 10, 12];
  const badges = ["none", "none", "none", "FIRE", "GOD_MODE", "TRIPLE_DBL", "TURNOVER_MACHINE"];

  for (let i = 0; i < 100; i++) {
    const tier = tiers[i % tiers.length];
    const star = STARS[i % STARS.length];
    const ratio = ratios[i % ratios.length];
    const streak = streaks[i % streaks.length];
    const badge = badges[i % badges.length];
    const opp = OPPONENTS[i % OPPONENTS.length];
    const tierFloor = TIER_FLOORS[tier] ?? 0;
    const margin = tier === "BUST" ? -(5 + (i % 20)) : (2 + (i % 18));
    const totalFp = tierFloor + margin;

    scenarios.push({
      winTier: tier,
      totalFp,
      starName: star.name,
      starRatio: ratio,
      streak,
      opponent: opp,
      badge,
    });
  }

  return scenarios;
}

// ─── Run and print ──────────────────────────────────────────────────────────

const scenarios = generate100();
const TIER_EMOJI: Record<string, string> = {
  BUST: "❌", ROOKIE: "🟡", STARTER: "🟢", ALL_STAR: "⭐", MVP: "🏆", LEGEND: "👑",
};

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  COMMENTARY SYSTEM — 100 TEST RUNS");
console.log("═══════════════════════════════════════════════════════════════\n");

const toneCount: Record<string, number> = {};
const uniqueMessages = new Set<string>();

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const input = buildInput(s);
  const result = composeCommentary(input as any);
  const emoji = TIER_EMOJI[s.winTier] ?? "?";
  const isBust = s.winTier === "BUST";

  // Track uniqueness
  uniqueMessages.add(result.primary);

  const fpLabel = `${s.totalFp.toFixed(0)} FP`;
  const ratioLabel = `ratio ${s.starRatio.toFixed(1)}`;
  const streakLabel = s.streak > 0 ? ` | streak ${s.streak}` : "";
  const badgeLabel = s.badge !== "none" ? ` | ${s.badge}` : "";
  const starLast = s.starName.split(" ").pop();

  console.log(`${String(i + 1).padStart(3)}. ${emoji} ${s.winTier.padEnd(8)} | ${fpLabel.padEnd(7)} | ${starLast?.padEnd(20)} | ${ratioLabel}${streakLabel}${badgeLabel}`);
  console.log(`     💬 ${result.primary}`);
  console.log("");
}

console.log("═══════════════════════════════════════════════════════════════");
console.log(`  SUMMARY`);
console.log(`  Total runs: 100`);
console.log(`  Unique messages: ${uniqueMessages.size}/100`);
console.log("═══════════════════════════════════════════════════════════════\n");

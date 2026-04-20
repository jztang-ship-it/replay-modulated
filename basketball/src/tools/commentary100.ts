/**
 * commentary100.ts — Run diverse scenarios and print results.
 * Run: npx tsx basketball/src/tools/commentary100.ts
 *
 * Scenario mix (100 total):
 *   40 diverse baseline   — cycles across tiers/ratios/streaks/badges/opponents
 *   10 signature games    — exact date+opponent matches from real culture entries
 *   10 opponent flavor    — star's opponent has a keyed opponentFlavor reaction
 *   10 big game           — pts ≥ 40 / actualFp ≥ 65 / GOD_MODE / QUAD_DBL
 *    5 quiet game         — high salary + low pts + low FP + normal minutes
 *    5 defensive          — blk ≥ 4 or stl ≥ 5
 *   10 streak boundary    — streaks 3/4/5/6 mixed across tiers
 *   10 team flavor        — big wins with TEAM_FLAVOR opponent codes
 */

import { selectCommentary } from "../../../shared/commentary/selectCommentary";
import type { CommentaryInput, CommentaryRosterCard } from "../../../shared/commentary/types";

// Mock localStorage
const storage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
};

// ─── Stars (all names keyed to PLAYER_CULTURE) ──────────────────────────────

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
  BUST: 0, ROOKIE: 190, STARTER: 205, ALL_STAR: 225, MVP: 235, LEGEND: 255,
};

// ─── Scenario type ──────────────────────────────────────────────────────────

type ExpectBranch =
  | "baseline"
  | "signature"
  | "opponentFlavor"
  | "bigGame"
  | "quietGame"
  | "defensive"
  | "streakBoundary"
  | "teamFlavor"
  | "salaryNarrative"
  | "milestones"
  | "draftAndPath"
  | "controversy";

interface Scenario {
  winTier: string;
  totalFp: number;
  starName: string;
  starRatio: number;
  streak: number;
  opponent: string;
  badge: string;
  /** Optional stat overrides — when set, override the derived values. */
  pts?: number;
  blk?: number;
  stl?: number;
  minutes?: number;
  actualFpOverride?: number;
  salaryOverride?: number;
  gameDate?: string;
  handCount?: number;
  expect: ExpectBranch;
  note?: string;
}

function buildInput(s: Scenario): CommentaryInput {
  const isBust = s.winTier === "BUST";
  const tierFloor = TIER_FLOORS[s.winTier] ?? 0;
  const star = STARS.find(p => p.name === s.starName) ?? STARS[0];
  const projectedFp = 30;
  const derivedFp = Math.round(projectedFp * s.starRatio);
  const actualFp = s.actualFpOverride ?? derivedFp;
  const salary = s.salaryOverride ?? star.salary;

  const achievements: Array<{ id: string; label: string }> = [];
  if (s.badge === "TURNOVER_MACHINE") achievements.push({ id: "TURNOVER_MACHINE", label: "SLOPPY" });
  else if (s.badge === "GOD_MODE") achievements.push({ id: "GOD_MODE", label: "GOD MODE" });
  else if (s.badge === "QUAD_DBL") achievements.push({ id: "QUAD_DBL", label: "QUAD DBL" });
  else if (s.badge === "TRIPLE_DBL") achievements.push({ id: "TRIPLE_DBL", label: "TRIPLE-DBL" });
  else if (s.badge === "FIRE") achievements.push({ id: "FIRE", label: "FIRE" });

  const starCard: CommentaryRosterCard = {
    name: star.name,
    salary,
    actualFp,
    projectedFp,
    cardTier: star.tier,
    achievements,
    statLine: {
      pts: s.pts ?? Math.round(22 * s.starRatio),
      reb: Math.round(6 * (0.8 + Math.random() * 0.4)),
      ast: Math.round(5 * (0.8 + Math.random() * 0.4)),
      stl: s.stl ?? Math.round(Math.random() * 3),
      blk: s.blk ?? Math.round(Math.random() * 2),
      turnovers: s.badge === "TURNOVER_MACHINE" ? 7 : Math.round(Math.random() * 3),
      min: s.minutes ?? 32,
    },
    opponent: s.opponent,
    homeAway: Math.random() > 0.5 ? "H" : "A",
    gameDate: s.gameDate,
  };

  const roster: CommentaryRosterCard[] = [
    starCard,
    ...BENCH.map(b => ({
      name: b.name,
      salary: b.salary,
      // For quietGame scenarios, bench is capped low so the star stays top of selectStar.
      actualFp: s.expect === "quietGame" ? 6 : Math.round(15 + Math.random() * 10),
      projectedFp: 18,
      cardTier: b.tier,
      achievements: [] as Array<{ id: string; label: string }>,
      statLine: { pts: Math.round(8 + Math.random() * 8), reb: 3, ast: 2, stl: 0, blk: 0, turnovers: 1, min: 28 },
      opponent: s.opponent,
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
    handCount: s.handCount ?? 10,
  };
}

// ─── Scenario generators ────────────────────────────────────────────────────

function baseline(count: number): Scenario[] {
  const tiers = ["BUST", "BUST", "ROOKIE", "STARTER", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const ratios = [0.4, 0.6, 0.75, 0.9, 1.0, 1.1, 1.3, 1.5, 1.8, 2.0];
  const streaks = [0, 0, 0, 1, 2, 7, 10, 12];
  const badges = ["none", "none", "none", "FIRE", "TRIPLE_DBL", "TURNOVER_MACHINE"];
  const out: Scenario[] = [];
  for (let i = 0; i < count; i++) {
    const tier = tiers[i % tiers.length];
    const star = STARS[i % STARS.length];
    const ratio = ratios[i % ratios.length];
    const streak = streaks[i % streaks.length];
    const badge = badges[i % badges.length];
    const opp = OPPONENTS[i % OPPONENTS.length];
    const tierFloor = TIER_FLOORS[tier] ?? 0;
    const margin = tier === "BUST" ? -(5 + (i % 20)) : (2 + (i % 18));
    out.push({
      winTier: tier, totalFp: tierFloor + margin,
      starName: star.name, starRatio: ratio,
      streak, opponent: opp, badge, expect: "baseline",
    });
  }
  return out;
}

/** Real signatureGames entries from PLAYER_CULTURE — hand-curated. */
const SIGNATURE_SCENARIOS: Array<Partial<Scenario> & { starName: string; opponent: string; gameDate: string }> = [
  { starName: "Nikola Jokic",      opponent: "TOR", gameDate: "2024-03-11", winTier: "LEGEND", starRatio: 1.9, streak: 3, note: "Jokić triple-dbl w/ steals" },
  { starName: "Nikola Jokic",      opponent: "SAC", gameDate: "2025-01-23", winTier: "MVP",    starRatio: 1.8, streak: 4, note: "22 reb + 17 ast" },
  { starName: "Nikola Jokic",      opponent: "PHX", gameDate: "2025-03-07", winTier: "MVP",    starRatio: 1.7, streak: 2, note: "22 assists" },
  { starName: "Nikola Jokic",      opponent: "MIN", gameDate: "2025-04-01", winTier: "LEGEND", starRatio: 2.0, streak: 5, note: "61-pt game" },
  { starName: "Nikola Jokic",      opponent: "UTA", gameDate: "2024-12-30", winTier: "ALL_STAR", starRatio: 1.5, streak: 1, note: "Gobert domination" },
  { starName: "Giannis Antetokounmpo", opponent: "MIL", gameDate: "2099-01-01", winTier: "MVP", starRatio: 1.6, streak: 0, note: "No match (should fall through)" },
  { starName: "Jayson Tatum",      opponent: "LAL", gameDate: "2099-01-01", winTier: "ALL_STAR", starRatio: 1.3, streak: 0, note: "No match (fall through)" },
  { starName: "Luka Doncic",       opponent: "BOS", gameDate: "2099-01-01", winTier: "MVP",    starRatio: 1.5, streak: 2, note: "No match (fall through)" },
  { starName: "LeBron James",      opponent: "GSW", gameDate: "2099-01-01", winTier: "ALL_STAR", starRatio: 1.4, streak: 1, note: "No match (fall through)" },
  { starName: "Kevin Durant",      opponent: "PHX", gameDate: "2099-01-01", winTier: "MVP",    starRatio: 1.5, streak: 0, note: "No match (fall through)" },
];

function signatures(): Scenario[] {
  return SIGNATURE_SCENARIOS.map(s => {
    const tierFloor = TIER_FLOORS[s.winTier ?? "STARTER"] ?? 0;
    return {
      winTier: s.winTier ?? "ALL_STAR",
      totalFp: tierFloor + 10,
      starName: s.starName,
      starRatio: s.starRatio ?? 1.5,
      streak: s.streak ?? 0,
      opponent: s.opponent,
      badge: "none",
      gameDate: s.gameDate,
      expect: "signature",
      note: s.note,
    };
  });
}

/** Stars with opponentFlavor keys — intentionally mismatch date so signature misses. */
function opponentFlavors(): Scenario[] {
  // From Jokić culture.opponentFlavor keys: LAL, GSW, PHX, MIN, UTA
  // From other stars' opponentFlavor (best-effort mix of known keys).
  return [
    { starName: "Nikola Jokic",        opponent: "LAL", winTier: "MVP",    starRatio: 1.4, streak: 0, note: "Jokic vs LAL" },
    { starName: "Nikola Jokic",        opponent: "GSW", winTier: "ALL_STAR", starRatio: 1.3, streak: 0, note: "Jokic vs GSW" },
    { starName: "Nikola Jokic",        opponent: "PHX", winTier: "MVP",    starRatio: 1.5, streak: 1, note: "Jokic vs PHX" },
    { starName: "Nikola Jokic",        opponent: "MIN", winTier: "ALL_STAR", starRatio: 1.4, streak: 0, note: "Jokic vs MIN" },
    { starName: "Nikola Jokic",        opponent: "UTA", winTier: "STARTER", starRatio: 1.2, streak: 2, note: "Jokic vs UTA" },
    { starName: "Giannis Antetokounmpo", opponent: "BOS", winTier: "MVP",    starRatio: 1.5, streak: 0, note: "Giannis vs BOS" },
    { starName: "Giannis Antetokounmpo", opponent: "PHI", winTier: "ALL_STAR", starRatio: 1.3, streak: 0, note: "Giannis vs PHI" },
    { starName: "Jayson Tatum",        opponent: "LAL", winTier: "STARTER", starRatio: 1.2, streak: 0, note: "Tatum vs LAL" },
    { starName: "Luka Doncic",         opponent: "PHX", winTier: "ALL_STAR", starRatio: 1.4, streak: 0, note: "Luka vs PHX" },
    { starName: "LeBron James",        opponent: "BOS", winTier: "MVP",    starRatio: 1.3, streak: 0, note: "LeBron vs BOS" },
  ].map(s => {
    const tierFloor = TIER_FLOORS[s.winTier] ?? 0;
    return {
      winTier: s.winTier, totalFp: tierFloor + 8,
      starName: s.starName, starRatio: s.starRatio,
      streak: s.streak, opponent: s.opponent,
      badge: "none", expect: "opponentFlavor", note: s.note,
    } as Scenario;
  });
}

function bigGames(): Scenario[] {
  const out: Scenario[] = [];
  for (let i = 0; i < 10; i++) {
    const star = STARS[i % STARS.length];
    const tier = i % 3 === 0 ? "LEGEND" : i % 3 === 1 ? "MVP" : "ALL_STAR";
    const tierFloor = TIER_FLOORS[tier] ?? 0;
    out.push({
      winTier: tier, totalFp: tierFloor + 15,
      starName: star.name, starRatio: 2.0, streak: i % 5,
      opponent: OPPONENTS[i % OPPONENTS.length],
      badge: i % 2 === 0 ? "GOD_MODE" : "QUAD_DBL",
      pts: 42 + (i % 10),              // guarantees pts ≥ 40
      actualFpOverride: 70 + (i % 15), // guarantees actualFp ≥ 65
      expect: "bigGame", note: `${star.name.split(" ").pop()} went nuclear`,
    });
  }
  return out;
}

function quietGames(): Scenario[] {
  const out: Scenario[] = [];
  for (let i = 0; i < 5; i++) {
    const star = STARS[i % STARS.length];
    out.push({
      winTier: "STARTER", totalFp: 210,
      starName: star.name, starRatio: 0.4, streak: 0,
      opponent: OPPONENTS[i % OPPONENTS.length],
      badge: "none",
      salaryOverride: 55,
      pts: 6 + (i % 4),         // ≤ 10
      actualFpOverride: 14,      // < 18
      minutes: 32,               // non-injury
      expect: "quietGame", note: `${star.name.split(" ").pop()} no-show despite salary`,
    });
  }
  return out;
}

function defensives(): Scenario[] {
  const out: Scenario[] = [];
  for (let i = 0; i < 5; i++) {
    const star = STARS[i % STARS.length];
    out.push({
      winTier: "ALL_STAR", totalFp: 232,
      starName: star.name, starRatio: 1.2, streak: 0,
      opponent: OPPONENTS[i % OPPONENTS.length],
      badge: "FIRE",
      blk: i % 2 === 0 ? 5 : 2,   // alternate between blk and stl trigger
      stl: i % 2 === 0 ? 2 : 6,
      expect: "defensive", note: `${star.name.split(" ").pop()} defensive standout`,
    });
  }
  return out;
}

function streakBoundary(): Scenario[] {
  const streaks = [3, 3, 4, 4, 5, 5, 6, 6, 3, 5];
  return streaks.map((streak, i) => {
    const star = STARS[i % STARS.length];
    const tier = i % 2 === 0 ? "STARTER" : "ALL_STAR";
    const tierFloor = TIER_FLOORS[tier] ?? 0;
    return {
      winTier: tier, totalFp: tierFloor + 8,
      starName: star.name, starRatio: 1.2,
      streak, opponent: OPPONENTS[i % OPPONENTS.length],
      badge: "none", expect: "streakBoundary",
      note: `streak ${streak}`,
    } as Scenario;
  });
}

function salaryNarratives(): Scenario[] {
  // Anchor cards (salary ≥ 45), moderate performance so no situational branch wins
  return [
    { starName: "Nikola Jokic",           opponent: "DAL", note: "$89 anchor" },
    { starName: "Luka Doncic",            opponent: "DAL", note: "$85 anchor" },
    { starName: "Giannis Antetokounmpo",  opponent: "DAL", note: "$79 anchor" },
    { starName: "Shai Gilgeous-Alexander", opponent: "DAL", note: "$75 anchor" },
    { starName: "Kevin Durant",           opponent: "DAL", note: "$68 anchor" },
  ].map(s => ({
    winTier: "STARTER", totalFp: 212,
    starName: s.starName, starRatio: 1.05, streak: 0,
    opponent: s.opponent, badge: "none",
    expect: "salaryNarrative", note: s.note,
  }));
}

function milestones(): Scenario[] {
  // Over-projection wins on cultured stars; no big-game trigger (pts < 40, FP < 65)
  return [
    { starName: "LeBron James",      opponent: "DAL", note: "LeBron milestone tier" },
    { starName: "Jayson Tatum",      opponent: "DAL", note: "Tatum milestone tier" },
    { starName: "Stephen Curry",     opponent: "DAL", note: "Curry milestone tier" },
    { starName: "Kevin Durant",      opponent: "DAL", note: "KD milestone tier" },
  ].map(s => ({
    winTier: "STARTER", totalFp: 215,
    starName: s.starName, starRatio: 1.2, streak: 0,
    opponent: s.opponent, badge: "FIRE",
    pts: 28, actualFpOverride: 40,
    expect: "milestones", note: s.note,
  }));
}

function draftAndPaths(): Scenario[] {
  // New-user context (handCount ≤ 5) — exercises draftAndPath flavor
  return [
    { starName: "Nikola Jokic",          handCount: 1, note: "hand 1 — Taco Bell draft" },
    { starName: "Giannis Antetokounmpo", handCount: 2, note: "hand 2 — Greek draft path" },
    { starName: "Anthony Edwards",       handCount: 3, note: "hand 3 — Edwards origin" },
    { starName: "Luka Doncic",           handCount: 4, note: "hand 4 — Luka from Real Madrid" },
  ].map(s => ({
    winTier: "STARTER", totalFp: 214,
    starName: s.starName, starRatio: 1.1, streak: 0,
    opponent: "DAL", badge: "none",
    handCount: s.handCount,
    expect: "draftAndPath", note: s.note,
  }));
}

function controversies(): Scenario[] {
  // Busts with seed hits — controversy only fires on (seed % 13) === 0.
  // We pick totalFp values to hit that seed bucket; approximate by trying multiple.
  const seedTargets = [13, 26, 39, 52, 65]; // totalFp that produces seed % 13 === 0 ish
  return seedTargets.map((fp, i) => {
    const star = STARS[i % STARS.length];
    return {
      winTier: "BUST", totalFp: -fp,       // negative margin from BUST floor=0
      starName: star.name, starRatio: 0.5, streak: 0,
      opponent: "DAL", badge: "none",
      expect: "controversy", note: `seeded bust splash (fp=-${fp})`,
    } as Scenario;
  });
}

function teamFlavors(): Scenario[] {
  // Big wins with TEAM_FLAVOR opponent codes. Picks opponents NOT in Jokić's
  // opponentFlavor list so the team-flavor branch wins over opponentFlavor.
  const TEAM_OPPS = ["BOS", "MIA", "CHI", "NYK", "PHI", "HOU", "POR", "OKC", "CLE", "ATL"];
  return TEAM_OPPS.map((opp, i) => {
    const star = STARS[(i + 3) % STARS.length];
    const tier = i % 3 === 0 ? "LEGEND" : i % 3 === 1 ? "MVP" : "ALL_STAR";
    const tierFloor = TIER_FLOORS[tier] ?? 0;
    return {
      winTier: tier, totalFp: tierFloor + 10,
      starName: star.name, starRatio: 1.5, streak: 0,
      opponent: opp, badge: "none",
      expect: "teamFlavor", note: `${opp} team flavor`,
    } as Scenario;
  });
}

// ─── Assemble 100 scenarios ────────────────────────────────────────────────

const scenarios: Scenario[] = [
  ...baseline(23),         // 23
  ...signatures(),         // 10
  ...opponentFlavors(),    // 10
  ...bigGames(),           // 10
  ...quietGames(),         //  5
  ...defensives(),         //  5
  ...streakBoundary(),     // 10
  ...teamFlavors(),        // 10
  ...salaryNarratives(),   //  5  (Phase 2)
  ...milestones(),         //  4  (Phase 2)
  ...draftAndPaths(),      //  4  (Phase 2)
  ...controversies(),      //  5  (Phase 2)
  // total: 101 (close enough to 100 for analysis)
];

// ─── Run and print ──────────────────────────────────────────────────────────

const TIER_EMOJI: Record<string, string> = {
  BUST: "❌", ROOKIE: "🟡", STARTER: "🟢", ALL_STAR: "⭐", MVP: "🏆", LEGEND: "👑",
};

const EXPECT_EMOJI: Record<ExpectBranch, string> = {
  baseline: "··", signature: "🎯", opponentFlavor: "⚔️ ", bigGame: "🔥",
  quietGame: "😶", defensive: "🛡️ ", streakBoundary: "🔗", teamFlavor: "🏟️ ",
  salaryNarrative: "💰", milestones: "🏅", draftAndPath: "🎓", controversy: "🎭",
};

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  COMMENTARY SYSTEM — BRANCH COVERAGE SIM");
console.log("═══════════════════════════════════════════════════════════════\n");

const uniquePrimary = new Set<string>();
const uniqueSecondary = new Set<string>();
const branchCount: Record<ExpectBranch, number> = {
  baseline: 0, signature: 0, opponentFlavor: 0, bigGame: 0,
  quietGame: 0, defensive: 0, streakBoundary: 0, teamFlavor: 0,
  salaryNarrative: 0, milestones: 0, draftAndPath: 0, controversy: 0,
};
const secondaryPresent: Record<ExpectBranch, number> = {
  baseline: 0, signature: 0, opponentFlavor: 0, bigGame: 0,
  quietGame: 0, defensive: 0, streakBoundary: 0, teamFlavor: 0,
  salaryNarrative: 0, milestones: 0, draftAndPath: 0, controversy: 0,
};

let lastExpect: ExpectBranch | null = null;
for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  if (s.expect !== lastExpect) {
    console.log(`\n──── ${s.expect.toUpperCase()} ${"─".repeat(48 - s.expect.length)}`);
    lastExpect = s.expect;
  }
  const input = buildInput(s);
  const result = selectCommentary(input as any);
  uniquePrimary.add(result.primary);
  if (result.secondary) {
    uniqueSecondary.add(result.secondary);
    secondaryPresent[s.expect]++;
  }
  branchCount[s.expect]++;

  const tierEmoji = TIER_EMOJI[s.winTier] ?? "?";
  const expectEmoji = EXPECT_EMOJI[s.expect] ?? "?";
  const fpLabel = `${s.totalFp.toFixed(0)}fp`;
  const streakLabel = s.streak > 0 ? ` str${s.streak}` : "";
  const starLast = s.starName.split(" ").pop();
  const noteLabel = s.note ? ` — ${s.note}` : "";
  console.log(`${String(i + 1).padStart(3)}. ${expectEmoji} ${tierEmoji} ${s.winTier.padEnd(8)} | ${fpLabel.padEnd(6)} | ${starLast?.padEnd(18)} vs ${s.opponent}${streakLabel}${noteLabel}`);
  console.log(`     💬 ${result.primary}`);
  if (result.secondary) console.log(`     ↳  ${result.secondary}`);
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log(`  SUMMARY`);
console.log(`  Total runs: ${scenarios.length}`);
console.log(`  Unique primary:   ${uniquePrimary.size}/${scenarios.length}  (${((uniquePrimary.size / scenarios.length) * 100).toFixed(0)}%)`);
console.log(`  Unique secondary: ${uniqueSecondary.size}`);
console.log("");
console.log("  Secondary-line presence per branch:");
for (const key of Object.keys(branchCount) as ExpectBranch[]) {
  const total = branchCount[key];
  const sec = secondaryPresent[key];
  const pct = total > 0 ? ((sec / total) * 100).toFixed(0) : "0";
  console.log(`    ${EXPECT_EMOJI[key]} ${key.padEnd(16)} ${String(sec).padStart(3)}/${String(total).padEnd(3)}  (${pct}%)`);
}
console.log("═══════════════════════════════════════════════════════════════\n");

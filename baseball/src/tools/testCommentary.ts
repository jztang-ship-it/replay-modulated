/// <reference types="node" />
/**
 * testCommentary.ts — Batch commentary tester (baseball)
 *
 * Generates N synthetic hands using real baseball players.json and game-logs.json,
 * calls the deployed /api/commentary endpoint for each, and dumps results to a
 * text file you can paste into ChatGPT (or any other LLM) for grading.
 *
 * Usage (from ~/ReplayMod/baseball/):
 *   npx ts-node --project tsconfig.sim.json src/tools/testCommentary.ts 100
 *   npx ts-node --project tsconfig.sim.json src/tools/testCommentary.ts 50 \
 *     https://your-preview-url.vercel.app
 *
 * Outputs:
 *   ../scripts/commentary-output-<timestamp>.txt
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildPrompt } from "../../../shared/commentary/promptBuilder.js";
import type { CommentaryInput, CommentaryRosterCard } from "../../../shared/commentary/types.js";
import { buildBaseballContext } from "../utils/buildBaseballContext.js";

// __dirname shim for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────
const DEFAULT_N = 100;
const DEFAULT_URL = "https://replay-mod-git-working-john-tangs-projects-1c51aca7.vercel.app";
const SALARY_CAP = 220;
const ROSTER_SIZE = 5;
const ROSTER_SLOTS: string[] = ["BAT", "BAT", "BAT", "P", "P"];
const REQUEST_DELAY_MS = 250;       // throttle to avoid hammering the API
const REQUEST_TIMEOUT_MS = 15_000;

// Baseball win-tier thresholds (must mirror baseballConfig.ts).
const TIER_THRESHOLDS = [
  { tier: "BUST",     min: 0,    payout: "0x" },
  { tier: "ROOKIE",   min: 148,  payout: "0.5x" },
  { tier: "STARTER",  min: 178,  payout: "2.5x" },
  { tier: "ALL_STAR", min: 208,  payout: "7x" },
  { tier: "MVP",      min: 240,  payout: "15x" },
  { tier: "LEGEND",     min: 280,  payout: "50x" },
] as const;

// FP scoring weights
const FP_WEIGHTS: Record<string, number> = {
  h: 12, doubles: 5, triples: 10, hr: 20, r: 9, rbi: 9, bb: 6, sb: 12,
  ip: 3, k: 4, er: -3, w: 6, qs: 8,
};

// Position normalisation
const PITCHER_ALIASES = new Set(["SP", "RP", "LHP", "RHP", "P"]);
function normalizePosition(pos: string): "P" | "BAT" {
  return PITCHER_ALIASES.has(pos.toUpperCase()) ? "P" : "BAT";
}

// ── Badge definitions ────────────────────────────────────────────────────
type StatLine = Record<string, number>;

interface Badge {
  name: string;
  test: (s: StatLine) => boolean;
  bonus: number;
}

const HITTER_BADGES: Badge[] = [
  { name: "HIT_MACHINE",  test: s => (s.h ?? 0) >= 2, bonus: 3 },
  { name: "GOING_YARD",   test: s => (s.hr ?? 0) >= 1, bonus: 8 },
  { name: "CLEANUP",      test: s => (s.rbi ?? 0) >= 3, bonus: 8 },
  { name: "EYE_PLATE",    test: s => (s.bb ?? 0) >= 2, bonus: 5 },
  { name: "SPEEDSTER",    test: s => (s.sb ?? 0) >= 1, bonus: 4 },
  { name: "PERFECT_DAY",  test: s => (s.h ?? 0) >= 2 && (s.hr ?? 0) >= 1 && (s.rbi ?? 0) >= 2, bonus: 15 },
  { name: "CYCLE_WATCH",  test: s => (s.h ?? 0) >= 1 && (s.doubles ?? 0) >= 1 && (s.triples ?? 0) >= 1 && (s.hr ?? 0) >= 1, bonus: 25 },
];

const PITCHER_BADGES: Badge[] = [
  { name: "QUALITY_START", test: s => (s.ip ?? 0) >= 6 && (s.er ?? 0) <= 3, bonus: 6 },
  { name: "ACE",           test: s => (s.k ?? 0) >= 10, bonus: 10 },
  { name: "SHUTDOWN",      test: s => (s.ip ?? 0) >= 7 && (s.er ?? 0) === 0, bonus: 8 },
  { name: "MELTDOWN",      test: s => (s.er ?? 0) >= 5, bonus: -5 },
  { name: "WILD_THING",    test: s => (s.bb ?? 0) >= 3, bonus: -5 },
  { name: "NO_NO_WATCH",   test: s => (s.ip ?? 0) >= 7 && (s.h ?? 0) === 0 && (s.er ?? 0) === 0, bonus: 30 },
];

function computeBadgeBonus(stats: StatLine, isPitcher: boolean): number {
  const badges = isPitcher ? PITCHER_BADGES : HITTER_BADGES;
  let bonus = 0;
  for (const b of badges) {
    if (b.test(stats)) bonus += b.bonus;
  }
  return bonus;
}

function computeFpFromStats(stats: StatLine, isPitcher: boolean): number {
  let fp = 0;
  for (const [key, weight] of Object.entries(FP_WEIGHTS)) {
    fp += (stats[key] ?? 0) * weight;
  }
  fp += computeBadgeBonus(stats, isPitcher);
  return Math.max(0, Math.round(fp * 10) / 10);
}

// ── Types ────────────────────────────────────────────────────────────────
type RawPlayer = {
  id: string;
  basePlayerId?: string;
  name: string;
  team?: string;
  position: string;
  salary: number;
  tier?: string;
  avgFP?: number;
  projectedFp?: number;
};

type GameLog = {
  basePlayerId: string;
  playerId?: string;
  season?: number;
  date?: string;
  opponent?: string;
  stats: StatLine;
};

// ── Helpers ───────────────────────────────────────────────────────────────
function loadPlayers(): RawPlayer[] {
  const p = path.join(__dirname, "../../public/data/players.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as RawPlayer[];
}

function loadGameLogs(): GameLog[] {
  const p = path.join(__dirname, "../../public/data/game-logs.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as GameLog[];
}

function buildGameLogIndex(logs: GameLog[]): Map<string, GameLog[]> {
  const idx = new Map<string, GameLog[]>();
  for (const log of logs) {
    const key = log.basePlayerId;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key)!.push(log);
  }
  return idx;
}

function deriveTier(totalFp: number): string {
  let tier = "BUST";
  for (const t of TIER_THRESHOLDS) {
    if (totalFp >= t.min) tier = t.tier;
  }
  return tier;
}

function nextTierInfo(currentTier: string): { next: string | null; min: number | null } {
  const idx = TIER_THRESHOLDS.findIndex(t => t.tier === currentTier);
  if (idx < 0 || idx >= TIER_THRESHOLDS.length - 1) return { next: null, min: null };
  const next = TIER_THRESHOLDS[idx + 1];
  return { next: next.tier, min: next.min };
}

function tierFloor(currentTier: string): number {
  const t = TIER_THRESHOLDS.find(x => x.tier === currentTier);
  return t?.min ?? 0;
}

/** Box-Muller transform — normal distribution sample. */
function gaussian(mean: number, stddev: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** Check if a game log qualifies for a pitcher. */
function isPitcherLog(stats: StatLine): boolean {
  return (stats.ip ?? 0) >= 4;
}

/** Check if a game log qualifies for a batter. */
function isBatterLog(stats: StatLine): boolean {
  const pa = stats.pa ?? 0;
  const events = (stats.h ?? 0) + (stats.hr ?? 0) + (stats.r ?? 0) +
    (stats.rbi ?? 0) + (stats.bb ?? 0) + (stats.sb ?? 0) +
    (stats.doubles ?? 0) + (stats.triples ?? 0);
  return pa >= 3 && events >= 1;
}

/**
 * Sample an "actual FP" outcome for a player. Uses real game logs when
 * available, falling back to gaussian sampling.
 */
function sampleActualFp(
  p: RawPlayer,
  logIndex: Map<string, GameLog[]>,
): { fp: number; stats: StatLine } {
  const isPitcher = normalizePosition(p.position) === "P";
  const key = p.basePlayerId ?? p.id;
  const logs = logIndex.get(key);

  if (logs && logs.length > 0) {
    // Filter to qualifying logs
    const qualifying = logs.filter(l =>
      isPitcher ? isPitcherLog(l.stats) : isBatterLog(l.stats),
    );
    if (qualifying.length > 0) {
      const chosen = qualifying[Math.floor(Math.random() * qualifying.length)];
      const fp = computeFpFromStats(chosen.stats, isPitcher);
      return { fp, stats: { ...chosen.stats } };
    }
  }

  // Fallback: gaussian sampling (same as basketball)
  const baseline = p.avgFP ?? p.projectedFp ?? 20;
  const stddev = Math.max(8, baseline * 0.45);
  const sample = gaussian(baseline, stddev);
  const fp = Math.max(0, Math.round(sample * 10) / 10);
  return { fp, stats: {} };
}

/**
 * Build a 5-player roster within the salary cap, respecting position slots:
 * slots 0-2 → BAT, slots 3-4 → P.
 * Biased toward including at least one orange/purple anchor.
 */
function buildRoster(allPlayers: RawPlayer[]): RawPlayer[] {
  const batters = allPlayers.filter(p => normalizePosition(p.position) === "BAT");
  const pitchers = allPlayers.filter(p => normalizePosition(p.position) === "P");

  const roster: RawPlayer[] = [];
  const usedIds = new Set<string>();
  let salaryUsed = 0;

  function pickFromPool(pool: RawPlayer[], count: number, budget: number, slotsLeft: number): RawPlayer[] {
    const picked: RawPlayer[] = [];

    // Try to include an orange/purple anchor first
    if (picked.length === 0) {
      const anchors = pool
        .filter(p => !usedIds.has(p.id) && ["ORANGE", "PURPLE"].includes((p.tier ?? "").toUpperCase()))
        .sort(() => Math.random() - 0.5);
      for (const a of anchors) {
        if (a.salary > budget) continue;
        picked.push(a);
        usedIds.add(a.id);
        budget -= a.salary;
        break;
      }
    }

    // Fill the rest randomly
    const shuffled = pool.filter(p => !usedIds.has(p.id)).sort(() => Math.random() - 0.5);
    for (const p of shuffled) {
      if (picked.length >= count) break;
      const remainingSlots = count - picked.length;
      const maxThisPick = budget - (remainingSlots - 1) * 8;
      if (p.salary > maxThisPick) continue;
      picked.push(p);
      usedIds.add(p.id);
      budget -= p.salary;
    }

    // If we couldn't fill, pad with cheapest
    if (picked.length < count) {
      const cheapest = pool
        .filter(p => !usedIds.has(p.id))
        .sort((a, b) => a.salary - b.salary);
      for (const p of cheapest) {
        if (picked.length >= count) break;
        picked.push(p);
        usedIds.add(p.id);
      }
    }

    return picked.slice(0, count);
  }

  // Pick 3 BAT players, reserving budget for 2 pitchers
  const batPicks = pickFromPool(batters, 3, SALARY_CAP - 2 * 8, 5);
  for (const p of batPicks) salaryUsed += p.salary;
  roster.push(...batPicks);

  // Pick 2 P players with remaining budget
  const pPicks = pickFromPool(pitchers, 2, SALARY_CAP - salaryUsed, 2);
  roster.push(...pPicks);

  return roster.slice(0, ROSTER_SIZE);
}

function buildCommentaryInputForRoster(
  rosterPlayers: RawPlayer[],
  logIndex: Map<string, GameLog[]>,
): CommentaryInput {
  const roster: CommentaryRosterCard[] = rosterPlayers.map(p => {
    const { fp, stats } = sampleActualFp(p, logIndex);
    return {
      name: p.name,
      salary: p.salary,
      actualFp: fp,
      projectedFp: p.projectedFp ?? p.avgFP ?? 0,
      cardTier: (p.tier ?? "WHITE").toUpperCase(),
      statLine: stats,
      opponent: "",
      homeAway: "",
    };
  });

  const totalFp = roster.reduce((s, c) => s + c.actualFp, 0);
  const winTier = deriveTier(totalFp);
  const { next, min } = nextTierInfo(winTier);

  return {
    sport: "baseball",
    totalFp,
    winTier: winTier as any,
    nextTier: next as any,
    tierFloor: tierFloor(winTier),
    nextTierMin: min ?? undefined,
    streak: Math.floor(Math.random() * 5),
    prevStreak: Math.max(0, Math.floor(Math.random() * 5) - 1),
    isBust: winTier === "BUST",
    handCount: 1,
    roster,
  };
}

async function callCommentary(
  apiUrl: string,
  system: string,
  user: string,
): Promise<{ commentary?: string; tone?: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(`${apiUrl}/api/commentary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const data: any = await r.json();
    return { commentary: data.commentary, tone: data.tone };
  } catch (err: any) {
    clearTimeout(timer);
    return { error: err?.message ?? String(err) };
  }
}

function formatHandForLog(
  idx: number,
  input: CommentaryInput,
  payout: string,
  result: { commentary?: string; tone?: string; error?: string },
): string {
  const lines: string[] = [];
  lines.push(`──────────────────── HAND ${idx + 1} ────────────────────`);
  lines.push(`TIER: ${input.winTier} (${payout})  |  TOTAL FP: ${input.totalFp.toFixed(1)}`);
  if (input.nextTier && input.nextTierMin != null) {
    const gap = Math.max(0, input.nextTierMin - input.totalFp);
    lines.push(`NEXT TIER: ${input.nextTier} @ ${input.nextTierMin} (gap ${gap.toFixed(1)})`);
  }
  lines.push(`STREAK: ${input.streak}`);
  lines.push(`ROSTER:`);
  for (const c of input.roster) {
    const tier = (c.cardTier ?? "WHITE").toUpperCase();
    const tag = (tier === "ORANGE" || tier === "PURPLE") ? "★" : " ";
    lines.push(`  ${tag} ${c.name.padEnd(22)} [${tier.padEnd(7)}] $${String(c.salary).padStart(3)}  proj ${c.projectedFp.toFixed(1).padStart(5)}  actual ${c.actualFp.toFixed(1).padStart(5)}`);
  }
  lines.push("");
  if (result.error) {
    lines.push(`COMMENTARY: [ERROR] ${result.error}`);
  } else {
    lines.push(`COMMENTARY (${result.tone ?? "?"}): ${result.commentary ?? "[empty]"}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const n = parseInt(argv[0] ?? "", 10) || DEFAULT_N;
  const apiUrl = (argv[1] ?? DEFAULT_URL).replace(/\/+$/, "");

  console.log(`testCommentary: ${n} hands → ${apiUrl}/api/commentary`);

  const players = loadPlayers();
  console.log(`loaded ${players.length} players from players.json`);

  const gameLogs = loadGameLogs();
  const logIndex = buildGameLogIndex(gameLogs);
  console.log(`loaded ${gameLogs.length} game logs (${logIndex.size} unique players)`);

  const recentTones: string[] = [];
  const outputBlocks: string[] = [];
  const stats = {
    total: 0,
    success: 0,
    error: 0,
    byTier: {} as Record<string, number>,
  };

  const start = Date.now();
  for (let i = 0; i < n; i++) {
    const rosterPlayers = buildRoster(players);
    if (rosterPlayers.length < ROSTER_SIZE) {
      console.warn(`hand ${i + 1}: roster build failed, skipping`);
      continue;
    }
    const input = buildCommentaryInputForRoster(rosterPlayers, logIndex);
    const culture = buildBaseballContext(input.roster);
    const { system, user } = buildPrompt(input, culture, recentTones);

    const result = await callCommentary(apiUrl, system, user);
    stats.total++;
    if (result.error) {
      stats.error++;
    } else {
      stats.success++;
      if (result.tone) {
        recentTones.unshift(result.tone);
        if (recentTones.length > 3) recentTones.pop();
      }
    }
    stats.byTier[input.winTier] = (stats.byTier[input.winTier] ?? 0) + 1;

    const tierMeta = TIER_THRESHOLDS.find(t => t.tier === input.winTier);
    const payout = tierMeta?.payout ?? "?";
    outputBlocks.push(formatHandForLog(i, input, payout, result));

    process.stdout.write(`\rhand ${i + 1}/${n}  ok=${stats.success} err=${stats.error}`);
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }
  process.stdout.write("\n");

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const summary = [
    `═══════════════════════════════════════════════════════════`,
    `commentary test summary`,
    `─────────────────────────`,
    `total: ${stats.total}  ok: ${stats.success}  err: ${stats.error}`,
    `elapsed: ${elapsed}s  (~${(stats.total / parseFloat(elapsed)).toFixed(1)} hands/sec)`,
    `tier distribution:`,
    ...Object.entries(stats.byTier)
      .sort((a, b) => TIER_THRESHOLDS.findIndex(t => t.tier === a[0]) - TIER_THRESHOLDS.findIndex(t => t.tier === b[0]))
      .map(([t, c]) => `  ${t.padEnd(10)} ${c}`),
    `═══════════════════════════════════════════════════════════`,
    "",
  ].join("\n");

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(__dirname, "../../../scripts");
  const outPath = path.join(outDir, `commentary-output-${ts}.txt`);
  fs.writeFileSync(outPath, summary + outputBlocks.join("\n"), "utf8");

  console.log(summary);
  console.log(`output written to: ${outPath}`);
}

main().catch(err => {
  console.error("testCommentary failed:", err);
  process.exit(1);
});

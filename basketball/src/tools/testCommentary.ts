/// <reference types="node" />
/**
 * testCommentary.ts — Batch commentary tester
 *
 * Generates N synthetic hands using real basketball players.json, calls the
 * deployed /api/commentary endpoint for each, and dumps results to a text
 * file you can paste into ChatGPT (or any other LLM) for grading.
 *
 * Usage (from ~/ReplayMod/basketball/):
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
import { buildBasketballContext } from "../utils/buildBasketballContext.js";

// __dirname shim for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────
const DEFAULT_N = 100;
const DEFAULT_URL = "https://replay-mod-git-working-john-tangs-projects-1c51aca7.vercel.app";
const SALARY_CAP = 200;
const ROSTER_SIZE = 6;
const REQUEST_DELAY_MS = 250;       // throttle to avoid hammering the API
const REQUEST_TIMEOUT_MS = 15_000;
const NBA_TEAMS = [
  "ATL","BOS","BKN","CHA","CHI","CLE","DAL","DEN","DET","GSW",
  "HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK",
  "OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS",
];

// Basketball win-tier thresholds (must mirror basketballConfig.ts).
const TIER_THRESHOLDS = [
  { tier: "BUST",     min: 0,    payout: "0x" },
  { tier: "ROOKIE",   min: 190,  payout: "0.5x" },
  { tier: "STARTER",  min: 205,  payout: "1.5x" },
  { tier: "ALL_STAR", min: 225,  payout: "3x" },
  { tier: "MVP",      min: 235,  payout: "8x" },
  { tier: "LEGEND",   min: 250,  payout: "30x" },
] as const;

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

// ── Helpers ───────────────────────────────────────────────────────────────
function loadPlayers(): RawPlayer[] {
  const p = path.join(__dirname, "../../public/data/players.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as RawPlayer[];
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

/**
 * Build a 6-player roster within the salary cap, biased toward including
 * at least one orange/purple anchor so the commentary has someone interesting
 * to talk about (mirrors how the actual game's roster builder works).
 */
function buildRoster(allPlayers: RawPlayer[]): RawPlayer[] {
  const oranges = allPlayers.filter(p => (p.tier ?? "").toUpperCase() === "ORANGE");
  const purples = allPlayers.filter(p => (p.tier ?? "").toUpperCase() === "PURPLE");
  const others  = allPlayers.filter(p => {
    const t = (p.tier ?? "").toUpperCase();
    return t !== "ORANGE" && t !== "PURPLE";
  });

  const roster: RawPlayer[] = [];
  const usedIds = new Set<string>();
  let salaryUsed = 0;

  // Always include 1 orange or purple anchor if budget allows.
  const anchorPool = [...oranges, ...purples].sort(() => Math.random() - 0.5);
  for (const p of anchorPool) {
    if (p.salary > SALARY_CAP) continue;
    roster.push(p);
    usedIds.add(p.id);
    salaryUsed += p.salary;
    break;
  }

  // Fill the rest greedily, mixing all tiers, fitting under cap.
  const fillPool = [...allPlayers]
    .filter(p => !usedIds.has(p.id))
    .sort(() => Math.random() - 0.5);

  for (const p of fillPool) {
    if (roster.length >= ROSTER_SIZE) break;
    const remainingSlots = ROSTER_SIZE - roster.length;
    const remainingBudget = SALARY_CAP - salaryUsed;
    // Leave room for the slots after this one (assume avg 10/slot minimum).
    const maxThisPick = remainingBudget - (remainingSlots - 1) * 8;
    if (p.salary > maxThisPick) continue;
    roster.push(p);
    usedIds.add(p.id);
    salaryUsed += p.salary;
  }

  // If we couldn't fill, just pad with cheapest available.
  if (roster.length < ROSTER_SIZE) {
    const cheapest = others
      .filter(p => !usedIds.has(p.id))
      .sort((a, b) => a.salary - b.salary);
    for (const p of cheapest) {
      if (roster.length >= ROSTER_SIZE) break;
      roster.push(p);
      usedIds.add(p.id);
    }
  }

  return roster.slice(0, ROSTER_SIZE);
}

/** Sample an "actual FP" outcome for a player given their projected/avg. */
function sampleActualFp(p: RawPlayer): number {
  const baseline = p.avgFP ?? p.projectedFp ?? 20;
  // Wide stddev so we get a healthy mix of busts, on-pace, and big games.
  const stddev = Math.max(8, baseline * 0.45);
  const sample = gaussian(baseline, stddev);
  return Math.max(0, Math.round(sample * 10) / 10);
}

function buildCommentaryInputForRoster(rosterPlayers: RawPlayer[]): CommentaryInput {
  const roster: CommentaryRosterCard[] = rosterPlayers.map(p => {
    // Pick a random opponent that isn't the player's own team
    const playerTeam = (p.team ?? "").toUpperCase();
    const opponents = NBA_TEAMS.filter(t => t !== playerTeam);
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    const homeAway = Math.random() > 0.5 ? "H" : "A";
    return {
      name: p.name,
      salary: p.salary,
      actualFp: sampleActualFp(p),
      projectedFp: p.projectedFp ?? p.avgFP ?? 0,
      cardTier: (p.tier ?? "WHITE").toUpperCase(),
      statLine: {},
      opponent,
      homeAway,
    };
  });

  const totalFp = roster.reduce((s, c) => s + c.actualFp, 0);
  const winTier = deriveTier(totalFp);
  const { next, min } = nextTierInfo(winTier);

  return {
    sport: "basketball",
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
    const input = buildCommentaryInputForRoster(rosterPlayers);
    const culture = buildBasketballContext(input.roster);
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

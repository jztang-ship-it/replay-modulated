#!/usr/bin/env node
/**
 * dumpFpDistribution.ts — Per-season FP distribution dump.
 *
 * Calls generateRoster from shared/engines/rosterEngine directly (no deal-
 * model reimplementation) for each season under basketball/public/data/
 * seasons/<season>/, resolves each card with uniform log sampling, and
 * prints the FP distribution (min, p10, p25, median, mean, p75, p90, p95,
 * p99, max) per season.
 *
 * Companion to deriveThresholds.ts: same seeded distribution feeds both
 * tools. Use this when you want to see the raw FP shape; use derive when
 * you want the tier-cut percentiles + fit check against target bands.
 *
 * Formatter notes:
 * - Each column is right-aligned with a fixed visible width (>= 7 chars).
 * - Numeric values are emitted at 1-decimal precision via toFixed(1), then
 *   padStart to the column width. No display-only rounding that snaps two
 *   distinct values together.
 * - Columns separated by " | " (space-pipe-space) so eye-tracking can't
 *   skip a digit.
 *
 * Run from basketball/:
 *   npx tsx src/tools/dumpFpDistribution.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRoster, mulberry32 } from "../../../shared/engines/rosterEngine";
import type { PlayerEval, EconomyConfig, TierColor, SlotRequirement } from "../../../shared/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = path.resolve(HERE, "../../public/data/seasons");

const ECONOMY_CONFIG: EconomyConfig = {
  capMax: 250,
  salaryMin: 5,
  salaryMax: 95,
  salaryRatioCeiling: 1.60,
  salaryRatioFloor: 0.40,
  tierThresholds: [
    { tier: "RED" as TierColor, minSalary: 73 },
    { tier: "ORANGE" as TierColor, minSalary: 58 },
    { tier: "PURPLE" as TierColor, minSalary: 44 },
    { tier: "BLUE" as TierColor, minSalary: 30 },
    { tier: "GREEN" as TierColor, minSalary: 20 },
  ],
};

const FLEX_SLOTS: SlotRequirement[] = ["FLEX", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"];
const ROSTER_CONFIG = {
  rosterSize: 6,
  slotRequirements: FLEX_SLOTS,
  excludeFromFlex: [] as string[],
  positionAware: false,
};

const HANDS = 10000;
const MIN_MINUTES = 10;

function computeFp(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  return g("pts") * 1.0
       + g("reb") * 1.2
       + g("ast") * 1.5
       + g("stl") * 2.0
       + g("blk") * 2.0
       + g("turnovers") * -1.0;
}

function computeBadgeBonus(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  const pts = g("pts"), reb = g("reb"), ast = g("ast");
  const stl = g("stl"), blk = g("blk"), to = g("turnovers");
  let bonus = 0;
  if (pts >= 50) bonus += 10;
  else if (pts >= 40) bonus += 5;
  else if (pts >= 30) bonus += 2;
  if (reb >= 15) bonus += 5;
  else if (reb >= 10) bonus += 3;
  if (ast >= 15) bonus += 5;
  else if (ast >= 10) bonus += 3;
  if (stl >= 5) bonus += 4;
  else if (stl >= 3) bonus += 2;
  if (blk >= 5) bonus += 4;
  else if (blk >= 3) bonus += 2;
  if (ast >= 10 && to === 0) bonus += 8;
  else if (ast >= 5 && to === 0) bonus += 3;
  if (to >= 6) bonus -= 6;
  else if (to >= 4) bonus -= 3;
  const cats = [pts, reb, ast, stl, blk].filter(v => v >= 10).length;
  if (cats >= 4) bonus += 30;
  else if (cats >= 3) bonus += 8;
  else if (cats >= 2) bonus += 2;
  if ([pts, reb, ast, stl, blk].every(v => v >= 5)) bonus += 15;
  return bonus;
}

function logPlayable(l: any): boolean {
  const s = l?.stats ?? {};
  const hasPositive = Object.values(s).some((v: any) => typeof v === "number" && v > 0);
  if (!hasPositive) return false;
  const mp = s.mp ?? s.minutes ?? s.min ?? s.MIN ?? s.minutesPlayed;
  if (mp !== undefined && mp !== null) {
    const str = String(mp);
    const mins = str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
    if (Number.isFinite(mins) && mins < MIN_MINUTES) return false;
  }
  return true;
}

function pctileAt(sorted: number[], p: number): number {
  const i = Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1);
  return sorted[i];
}

interface SeasonRow {
  season: string;
  poolSize: number;
  fps: number[];
}

function runSeason(season: string): SeasonRow | null {
  const seasonDir = path.join(SEASONS_DIR, season);
  const playersJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "players.json"), "utf8"));
  const logsJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "gamelogs.json"), "utf8"));

  const logsByPlayer = new Map<string, any[]>();
  for (const l of logsJson) {
    const k = String(l.basePlayerId ?? "");
    if (!k) continue;
    if (!logPlayable(l)) continue;
    if (!logsByPlayer.has(k)) logsByPlayer.set(k, []);
    logsByPlayer.get(k)!.push(l);
  }

  const evalPool: PlayerEval[] = [];
  for (const p of playersJson) {
    const id = String(p.basePlayerId ?? p.id ?? "");
    if (!id) continue;
    if (!(p.salary > 0)) continue;
    if (!logsByPlayer.has(id) || logsByPlayer.get(id)!.length === 0) continue;
    const salary = Math.max(5, Number(p.salary));
    const tier = String(p.tier ?? "WHITE").toUpperCase() as TierColor;
    evalPool.push({
      id,
      basePlayerId: id,
      personKey: id,
      cardId: id + "_card",
      name: String(p.name ?? ""),
      team: String(p.team ?? ""),
      season,
      position: String(p.position ?? "PG").toUpperCase(),
      photoCode: String(p.photoCode ?? ""),
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      salary,
      tier,
    });
  }
  if (evalPool.length < 6) {
    console.warn(`  ${season}: pool too small (${evalPool.length}) — SKIPPED`);
    return null;
  }

  // Seeded per season so the run is reproducible.
  const rng = mulberry32(
    42
    + season.charCodeAt(0) * 257
    + season.charCodeAt(1) * 31
    + (season.charCodeAt(2) ?? 0) * 13
    + (season.charCodeAt(3) ?? 0)
  );
  const fps: number[] = [];
  let skipped = 0;

  for (let i = 0; i < HANDS; i++) {
    const roster = generateRoster(evalPool, ROSTER_CONFIG, ECONOMY_CONFIG, rng);
    if (roster.length < 6) { skipped++; continue; }
    let handFp = 0;
    for (const card of roster) {
      const cardLogs = logsByPlayer.get(card.basePlayerId) ?? [];
      if (!cardLogs.length) continue;
      const log = cardLogs[Math.floor(rng() * cardLogs.length)];
      const stats = log.stats ?? {};
      handFp += computeFp(stats) + computeBadgeBonus(stats);
    }
    fps.push(handFp);
  }
  if (skipped > 0) console.warn(`  ${season}: skipped ${skipped}/${HANDS} hands`);
  if (fps.length < HANDS / 2) return null;

  fps.sort((a, b) => a - b);
  return { season, poolSize: evalPool.length, fps };
}

// ── Formatter — fixed-width columns, right-aligned, no width-snap rounding ─
// Each numeric value is rendered at 1-decimal precision (via toFixed(1)),
// then padStart to COL_W. Adjacent percentiles can only collide visually
// when they round to the same value at that precision — there's no display-
// only rounding step that snaps two distinct underlying values together.
const COL_W = 7;            // wide enough for "9999.9" with a leading space
const SEP = " | ";          // explicit separator so eye-tracking can't skip a column
const SEPLEN = SEP.length;

function fmtNum(v: number): string {
  return v.toFixed(1).padStart(COL_W);
}
function fmtStr(v: string, w = COL_W): string {
  return v.padStart(w);
}

function renderRow(cols: string[]): string {
  return cols.join(SEP);
}

function renderDivider(numCols: number): string {
  return Array(numCols).fill("-".repeat(COL_W)).join(SEP.replace(/ /g, "-"));
}

function main() {
  const seasons = fs.readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  console.log(`[dump-fp] ${HANDS} hands × ${seasons.length} seasons  generateRoster (positionAware: false) + uniform log sampling\n`);

  const rows: SeasonRow[] = [];
  for (const s of seasons) {
    const row = runSeason(s);
    if (row) rows.push(row);
  }

  const headers = ["Sn", "pool", "min", "p10", "p25", "median", "mean", "p75", "p90", "p95", "p99", "max"];
  console.log(renderRow(headers.map(h => fmtStr(h))));
  console.log(renderDivider(headers.length));
  for (const r of rows) {
    const s = r.fps;
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    console.log(renderRow([
      fmtStr(r.season),
      fmtStr(String(r.poolSize)),
      fmtNum(s[0]),
      fmtNum(pctileAt(s, 10)),
      fmtNum(pctileAt(s, 25)),
      fmtNum(pctileAt(s, 50)),
      fmtNum(mean),
      fmtNum(pctileAt(s, 75)),
      fmtNum(pctileAt(s, 90)),
      fmtNum(pctileAt(s, 95)),
      fmtNum(pctileAt(s, 99)),
      fmtNum(s[s.length - 1]),
    ]));
  }
}

main();

#!/usr/bin/env node
/**
 * dumpSlateComposition.ts — Verify slate composition under proxy vs
 * production-helper career-FP computation. Runs both side-by-side for one
 * season and prints any per-tier top-N differences.
 *
 * The slate per-tier caps (BLUE top-40, GREEN top-25, WHITE top-20) rank
 * players by `getCareerFPById`. The proxy I had was per-season FP sum;
 * production's helper applies last-2-seasons × 2 weight. In single-season
 * calibration runs the difference is a uniform scalar within a season,
 * which mathematically preserves relative rank — this script verifies that
 * empirically (or surfaces any unexpected divergence).
 *
 * Run from basketball/:
 *   npx tsx src/tools/dumpSlateComposition.ts <season>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { computeBasketballCareerFp } from "../adapters/careerFp";
import type { RawLog } from "../../../shared/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = path.resolve(HERE, "../../public/data/seasons");

const MIN_MINUTES_LOG = 10;
const MIN_GAMES_THIS_SEASON = 30;
const TIER_POOL_CAPS: Record<string, number> = { BLUE: 40, GREEN: 25, WHITE: 20 };

function computeFp(s: Record<string, any>): number {
  const g = (k: string) => Number(s[k] ?? s[k.toLowerCase()] ?? 0);
  return g("pts") * 1.0 + g("reb") * 1.2 + g("ast") * 1.5
       + g("stl") * 2.0 + g("blk") * 2.0 + g("turnovers") * -1.0;
}

function logPlayable(l: any): boolean {
  const s = l?.stats ?? {};
  const hasPositive = Object.values(s).some((v: any) => typeof v === "number" && v > 0);
  if (!hasPositive) return false;
  const mp = s.mp ?? s.minutes ?? s.min ?? s.MIN ?? s.minutesPlayed;
  if (mp !== undefined && mp !== null) {
    const str = String(mp);
    const mins = str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
    if (Number.isFinite(mins) && mins < MIN_MINUTES_LOG) return false;
  }
  return true;
}

const season = process.argv[2] ?? "2425";
const seasonDir = path.join(SEASONS_DIR, season);
const playersJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "players.json"), "utf8"));
const logsJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "gamelogs.json"), "utf8"));

const totalGamesById = new Map<string, number>();
const logsByPlayer = new Map<string, RawLog[]>();
const logsByPlayerRaw = new Map<string, RawLog[]>();
for (const l of logsJson) {
  const k = String(l.basePlayerId ?? "");
  if (!k) continue;
  totalGamesById.set(k, (totalGamesById.get(k) ?? 0) + 1);
  if (!logsByPlayerRaw.has(k)) logsByPlayerRaw.set(k, []);
  logsByPlayerRaw.get(k)!.push(l);
  if (!logPlayable(l)) continue;
  if (!logsByPlayer.has(k)) logsByPlayer.set(k, []);
  logsByPlayer.get(k)!.push(l);
}

const playerById = new Map<string, any>();
for (const p of playersJson) {
  const id = String(p.basePlayerId ?? p.id ?? "");
  if (!id) continue;
  playerById.set(id, p);
}

const eligible: string[] = [];
for (const [id, p] of playerById) {
  if (!(p.salary > 0)) continue;
  if ((totalGamesById.get(id) ?? 0) < MIN_GAMES_THIS_SEASON) continue;
  if (!logsByPlayer.has(id) || logsByPlayer.get(id)!.length === 0) continue;
  eligible.push(id);
}

// PROXY: sum of FP from PLAYABLE logs only (what the old calibration used).
const proxy = new Map<string, number>();
for (const [id, logs] of logsByPlayer) {
  let sum = 0;
  for (const log of logs) sum += computeFp(log.stats ?? {});
  proxy.set(id, sum);
}

// PRODUCTION HELPER: walks RAW logs (matches production dataEngine's
// pre-filter state) with last-2-seasons × 2 weight.
const helper = new Map<string, number>();
for (const id of eligible) {
  helper.set(id, computeBasketballCareerFp(id, logsByPlayerRaw, computeFp));
}

// Group by tier.
const byTier = new Map<string, string[]>();
for (const id of eligible) {
  const t = String(playerById.get(id)?.tier ?? "WHITE").toUpperCase();
  if (!byTier.has(t)) byTier.set(t, []);
  byTier.get(t)!.push(id);
}

function topN(ids: string[], fpMap: Map<string, number>, n: number | undefined): string[] {
  const ranked = [...ids].sort((a, b) => (fpMap.get(b) ?? 0) - (fpMap.get(a) ?? 0));
  return n === undefined ? ranked : ranked.slice(0, n);
}

let mismatches = 0;
let totalCompared = 0;
for (const tier of ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"]) {
  const ids = byTier.get(tier) ?? [];
  const cap = TIER_POOL_CAPS[tier];
  const proxyTopN = topN(ids, proxy, cap);
  const helperTopN = topN(ids, helper, cap);

  const proxySet = new Set(proxyTopN);
  const helperSet = new Set(helperTopN);
  const inProxyNotHelper = proxyTopN.filter(id => !helperSet.has(id));
  const inHelperNotProxy = helperTopN.filter(id => !proxySet.has(id));

  totalCompared += proxyTopN.length;
  mismatches += inProxyNotHelper.length;

  // Also check intra-set ordering (same members, different rank).
  let rankSwaps = 0;
  for (let i = 0; i < Math.min(proxyTopN.length, helperTopN.length); i++) {
    if (proxyTopN[i] !== helperTopN[i]) rankSwaps++;
  }

  console.log(`\n${tier}  (pool size ${ids.length}, cap ${cap ?? "none"}):`);
  console.log(`  proxy top-${proxyTopN.length}:   ${proxyTopN.map(id => playerById.get(id)?.name ?? id).slice(0, 5).join(", ")}...`);
  console.log(`  helper top-${helperTopN.length}: ${helperTopN.map(id => playerById.get(id)?.name ?? id).slice(0, 5).join(", ")}...`);
  console.log(`  set diff: in-proxy-not-helper=${inProxyNotHelper.length}, in-helper-not-proxy=${inHelperNotProxy.length}`);
  console.log(`  rank swaps within top-N: ${rankSwaps}`);
  if (inProxyNotHelper.length || inHelperNotProxy.length) {
    if (inProxyNotHelper.length) {
      console.log(`    only in proxy: ${inProxyNotHelper.map(id => playerById.get(id)?.name ?? id).join(", ")}`);
    }
    if (inHelperNotProxy.length) {
      console.log(`    only in helper: ${inHelperNotProxy.map(id => playerById.get(id)?.name ?? id).join(", ")}`);
    }
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Season: ${season}`);
console.log(`Eligible: ${eligible.length}`);
console.log(`Members compared across all tier-caps: ${totalCompared}`);
console.log(`Set mismatches (different players selected): ${mismatches}`);

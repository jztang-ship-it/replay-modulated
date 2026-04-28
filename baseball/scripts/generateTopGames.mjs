#!/usr/bin/env node
/**
 * generateTopGames.mjs — Compute season top-10 per category + star career highs
 * from the baseball gamelog dataset and emit two lookup JSONs consumed by
 * the Top Games detector.
 *
 * Usage:
 *   node baseball/scripts/generateTopGames.mjs           # writes files
 *   node baseball/scripts/generateTopGames.mjs --dry-run # prints counts, no writes
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const GAMELOGS_PATH = resolve(ROOT, "baseball/public/data/game-logs.json");
const PLAYERS_PATH  = resolve(ROOT, "baseball/public/data/players.json");
const OUT_TOPGAMES  = resolve(ROOT, "baseball/public/data/topGames.json");
const OUT_CAREERHI  = resolve(ROOT, "baseball/public/data/careerHighs.json");

const SEASON = 2425;             // number in game-logs.json (not string)
const STAR_TIERS = new Set(["PURPLE", "ORANGE", "RED"]);
const TOP_N = 10;

// Categories tracked for both season top-10 and career highs.
// Matches CAREER_CATEGORIES.baseball in shared/data/recordDetector.ts.
const CATEGORIES = [
  { code: "hr",  label: (v) => `Top-${TOP_N} HR game of the season (${v} HR)` },
  { code: "h",   label: (v) => `Top-${TOP_N} hit game of the season (${v} hits)` },
  { code: "rbi", label: (v) => `Top-${TOP_N} RBI game of the season (${v} RBI)` },
  { code: "k",   label: (v) => `Top-${TOP_N} strikeout game of the season (${v} K)` },
  { code: "sb",  label: (v) => `Top-${TOP_N} stolen-base game of the season (${v} SB)` },
  { code: "ip",  label: (v) => `Top-${TOP_N} innings-pitched game of the season (${v} IP)` },
];

const DRY_RUN = process.argv.includes("--dry-run");

function log(...args) { console.log("[topGames]", ...args); }

function main() {
  const gamelogs = JSON.parse(readFileSync(GAMELOGS_PATH, "utf8"));
  const players  = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));

  const seasonRows = gamelogs.filter(r => Number(r.season) === SEASON);
  log(`Loaded ${seasonRows.length} rows for season=${SEASON}`);

  // ── 1. Season top-10 per category ────────────────────────────────────────
  const topGames = {}; // key = "{playerId}|{date}" → { reasons: [...] }

  for (const { code, label } of CATEGORIES) {
    const withValue = seasonRows
      .map(r => ({ r, v: Number(r.stats?.[code] ?? 0) }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v);

    const top = withValue.slice(0, TOP_N);
    log(`  ${code}: top-${TOP_N} cutoff = ${top[top.length - 1]?.v} (${top.length} games)`);

    for (const { r, v } of top) {
      const key = `${r.basePlayerId}|${r.date}`;
      if (!topGames[key]) topGames[key] = { reasons: [] };
      topGames[key].reasons.push({ category: code, label: label(v), value: v });
    }
  }

  log(`T2 bucket size: ${Object.keys(topGames).length} unique games across all categories`);

  // ── 2. Career highs for star players ─────────────────────────────────────
  // Players file uses string "2425"; gamelogs use number 2425.
  const starIds = new Set(
    players
      .filter(p => String(p.season) === String(SEASON) && STAR_TIERS.has(p.tier))
      .map(p => p.basePlayerId)
  );
  log(`Star players in scope: ${starIds.size}`);

  const careerHighs = {};
  for (const r of gamelogs) { // all seasons in dataset
    if (!starIds.has(r.basePlayerId)) continue;
    const c = careerHighs[r.basePlayerId] ?? (careerHighs[r.basePlayerId] = {});
    for (const { code } of CATEGORIES) {
      const v = Number(r.stats?.[code] ?? 0);
      if (v > (c[code] ?? 0)) c[code] = v;
    }
  }

  // ── 3. Emit or dry-run ──────────────────────────────────────────────────
  if (DRY_RUN) {
    log("--dry-run: no files written");
    return;
  }

  writeFileSync(OUT_TOPGAMES, JSON.stringify(topGames, null, 2) + "\n", "utf8");
  writeFileSync(OUT_CAREERHI, JSON.stringify(careerHighs, null, 2) + "\n", "utf8");
  log(`Wrote ${OUT_TOPGAMES}`);
  log(`Wrote ${OUT_CAREERHI}`);
}

main();

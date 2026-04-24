#!/usr/bin/env node
/**
 * generateTopGames.mjs — Compute season top-10 per category + star career highs
 * from the basketball gamelog dataset and emit two lookup JSONs consumed by
 * the Top Games detector.
 *
 * Usage:
 *   node basketball/scripts/generateTopGames.mjs           # writes files
 *   node basketball/scripts/generateTopGames.mjs --dry-run # prints counts, no writes
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const GAMELOGS_PATH = resolve(ROOT, "basketball/public/data/game-logs.json");
const PLAYERS_PATH  = resolve(ROOT, "basketball/public/data/players.json");
const OUT_TOPGAMES  = resolve(ROOT, "basketball/public/data/topGames_2425.json");
const OUT_CAREERHI  = resolve(ROOT, "basketball/public/data/careerHighs_2season.json");

const SEASON = "2425";
const STAR_TIERS = new Set(["PURPLE", "ORANGE", "RED"]);
const TOP_N = 10;

// Mirror NBA_ALL_TIME_THRESHOLDS priority ordering for sort stability.
const SINGLE_CATEGORIES = [
  { code: "pts",    priority: 50, label: (v) => `Top-${TOP_N} scoring game of the season (${v} pts)` },
  { code: "reb",    priority: 40, label: (v) => `Top-${TOP_N} rebound game of the season (${v} reb)` },
  { code: "ast",    priority: 40, label: (v) => `Top-${TOP_N} assist game of the season (${v} ast)` },
  { code: "threes", priority: 40, label: (v) => `Top-${TOP_N} three-point game of the season (${v} threes)` },
  { code: "stl",    priority: 40, label: (v) => `Top-${TOP_N} steal game of the season (${v} stl)` },
  { code: "blk",    priority: 40, label: (v) => `Top-${TOP_N} block game of the season (${v} blk)` },
];

// Composites: same codes as COMPOSITE_RULES. Inline the rules — this is node, can't easily import .ts.
const COMPOSITES = [
  { code: "quad_double",     priority: 100, label: "Top-rarity: quadruple-double",
    rule: s => [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => (v ?? 0) >= 10).length >= 4 },
  { code: "td_60_10_10",     priority: 95,  label: "Top-rarity: 60-point triple-double",
    rule: s => (s.pts ?? 0) >= 60 && (s.reb ?? 0) >= 10 && (s.ast ?? 0) >= 10 },
  { code: "td_40_20_20",     priority: 90,  label: "Top-rarity: 40/20/20 triple-double",
    rule: s => (s.pts ?? 0) >= 40 && (s.reb ?? 0) >= 20 && (s.ast ?? 0) >= 20 },
  { code: "td_30_20_20",     priority: 85,  label: "Top-rarity: 30/20/20 triple-double",
    rule: s => (s.pts ?? 0) >= 30 && (s.reb ?? 0) >= 20 && (s.ast ?? 0) >= 20 },
  { code: "five_by_five",    priority: 80,  label: "Top-rarity: 5x5 (5+ in five categories)",
    rule: s => [s.pts, s.reb, s.ast, s.stl, s.blk].every(v => (v ?? 0) >= 5) },
  { code: "fifty_plus_game", priority: 60,  label: "Top-rarity: 50-point game",
    rule: s => (s.pts ?? 0) >= 50 },
];

const DRY_RUN = process.argv.includes("--dry-run");

function log(...args) { console.log("[topGames]", ...args); }

function main() {
  const gamelogs = JSON.parse(readFileSync(GAMELOGS_PATH, "utf8"));
  const players  = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));

  const seasonRows = gamelogs.filter(r => r.season === SEASON);
  log(`Loaded ${seasonRows.length} rows for season=${SEASON}`);

  // ── 1. Season top-10 per single category ──────────────────────────────────
  const topGames = {}; // key = "{playerId}|{date}" → { reasons: [...] }

  for (const { code, priority, label } of SINGLE_CATEGORIES) {
    const withValue = seasonRows
      .map(r => ({ r, v: Number(r.stats?.[code] ?? 0) }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v);

    const top = withValue.slice(0, TOP_N);
    log(`  ${code}: top-${TOP_N} cutoff = ${top[top.length - 1]?.v} (${top.length} games)`);

    for (const { r, v } of top) {
      const key = `${r.basePlayerId}|${r.date}`;
      if (!topGames[key]) topGames[key] = { reasons: [] };
      topGames[key].reasons.push({ category: code, label: label(v), value: v, _priority: priority });
    }
  }

  // ── 2. Season composites (all matches, not top-N — these are rare) ────────
  for (const { code, priority, label, rule } of COMPOSITES) {
    const matches = seasonRows.filter(r => {
      try { return rule(r.stats ?? {}); } catch { return false; }
    });
    log(`  ${code}: ${matches.length} matches`);
    for (const r of matches) {
      const key = `${r.basePlayerId}|${r.date}`;
      if (!topGames[key]) topGames[key] = { reasons: [] };
      topGames[key].reasons.push({ category: code, label, value: 1, _priority: priority });
    }
  }

  // ── 3. Sort reasons within each entry by priority desc; strip _priority ──
  for (const key of Object.keys(topGames)) {
    topGames[key].reasons = topGames[key].reasons
      .sort((a, b) => b._priority - a._priority)
      .map(({ _priority, ...rest }) => rest);
  }

  log(`T2 bucket size: ${Object.keys(topGames).length} unique games across all categories`);

  // ── 4. Career highs for star players (PURPLE/ORANGE/RED) across both seasons ─
  const starIds = new Set(
    players
      .filter(p => p.season === SEASON && p.active === true && STAR_TIERS.has(p.tier))
      .map(p => p.basePlayerId)
  );
  log(`Star players in scope: ${starIds.size}`);

  const careerHighs = {};
  for (const r of gamelogs) { // both seasons
    if (!starIds.has(r.basePlayerId)) continue;
    const c = careerHighs[r.basePlayerId] ?? (careerHighs[r.basePlayerId] = {});
    for (const key of ["pts", "reb", "ast", "threes"]) {
      const v = Number(r.stats?.[key] ?? 0);
      if (v > (c[key] ?? 0)) c[key] = v;
    }
  }

  // ── 5. Emit or dry-run ────────────────────────────────────────────────────
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

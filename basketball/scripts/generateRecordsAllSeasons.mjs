#!/usr/bin/env node
/**
 * generateRecordsAllSeasons.mjs — Build the Top Games T2 (season top-10)
 * lookups for every season, plus T1 career highs across all 29 seasons for
 * every player who was star-tier (PURPLE/ORANGE/RED) at least once.
 *
 * Outputs:
 *   basketball/public/data/topGames.json     — merged T2 lookup across all 29 seasons
 *   basketball/public/data/careerHighs.json  — career highs aggregated 1996-97 → 2024-25
 *
 * The shape is identical to the old `topGames_2425.json`:
 *   { "{playerId}|{date}": { reasons: [{ category, label, value }, ...] } }
 * Keys are "{playerId}|{date}" so cross-season merging is collision-free.
 *
 * Usage:
 *   node basketball/scripts/generateRecordsAllSeasons.mjs           # writes files
 *   node basketball/scripts/generateRecordsAllSeasons.mjs --dry-run # reports counts only
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SEASONS_DIR  = resolve(ROOT, "basketball/public/data/seasons");
const OUT_TOPGAMES = resolve(ROOT, "basketball/public/data/topGames.json");
const OUT_CAREER   = resolve(ROOT, "basketball/public/data/careerHighs.json");

const STAR_TIERS = new Set(["PURPLE", "ORANGE", "RED"]);
const TOP_N = 10;
const DRY_RUN = process.argv.includes("--dry-run");

const SINGLE_CATEGORIES = [
  { code: "pts",    priority: 50, label: (v) => `Top-${TOP_N} scoring game of the season (${v} pts)` },
  { code: "reb",    priority: 40, label: (v) => `Top-${TOP_N} rebound game of the season (${v} reb)` },
  { code: "ast",    priority: 40, label: (v) => `Top-${TOP_N} assist game of the season (${v} ast)` },
  { code: "threes", priority: 40, label: (v) => `Top-${TOP_N} three-point game of the season (${v} threes)` },
  { code: "stl",    priority: 40, label: (v) => `Top-${TOP_N} steal game of the season (${v} stl)` },
  { code: "blk",    priority: 40, label: (v) => `Top-${TOP_N} block game of the season (${v} blk)` },
];

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

function log(...args) { console.log("[records]", ...args); }

function buildSeasonTopGames(seasonRows) {
  const topGames = {};
  for (const { code, priority, label } of SINGLE_CATEGORIES) {
    const ranked = seasonRows
      .map(r => ({ r, v: Number(r.stats?.[code] ?? 0) }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v);
    const top = ranked.slice(0, TOP_N);
    for (const { r, v } of top) {
      const key = `${r.basePlayerId}|${r.date}`;
      if (!topGames[key]) topGames[key] = { reasons: [] };
      topGames[key].reasons.push({ category: code, label: label(v), value: v, _priority: priority });
    }
  }
  for (const { code, priority, label, rule } of COMPOSITES) {
    const matches = seasonRows.filter(r => {
      try { return rule(r.stats ?? {}); } catch { return false; }
    });
    for (const r of matches) {
      const key = `${r.basePlayerId}|${r.date}`;
      if (!topGames[key]) topGames[key] = { reasons: [] };
      topGames[key].reasons.push({ category: code, label, value: 1, _priority: priority });
    }
  }
  for (const key of Object.keys(topGames)) {
    topGames[key].reasons = topGames[key].reasons
      .sort((a, b) => b._priority - a._priority)
      .map(({ _priority, ...rest }) => rest);
  }
  return topGames;
}

function main() {
  const seasons = readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  log(`Found ${seasons.length} seasons in ${SEASONS_DIR}`);

  // ── Pass 1: identify ever-star players across all 29 seasons ─────────────
  const everStar = new Set();
  for (const s of seasons) {
    const f = join(SEASONS_DIR, s, "players.json");
    if (!existsSync(f)) continue;
    for (const p of JSON.parse(readFileSync(f, "utf8"))) {
      if (STAR_TIERS.has(p.tier)) everStar.add(p.basePlayerId);
    }
  }
  log(`Ever-star players (PURPLE/ORANGE/RED in any season): ${everStar.size}`);

  // ── Pass 2: per-season top games (merged into one map) + career highs ────
  const careerHighs = {};
  const allTopGames = {};

  for (const s of seasons) {
    const logsFile = join(SEASONS_DIR, s, "gamelogs.json");
    if (!existsSync(logsFile)) {
      log(`  ${s}: no gamelogs.json — skipping`);
      continue;
    }
    const rows = JSON.parse(readFileSync(logsFile, "utf8"));

    // T2 — per-season top-N + composites, merged into the global map
    const seasonTop = buildSeasonTopGames(rows);
    const t2Count = Object.keys(seasonTop).length;
    Object.assign(allTopGames, seasonTop);

    // T1 — accumulate career highs for ever-star players from this season's logs
    for (const r of rows) {
      if (!everStar.has(r.basePlayerId)) continue;
      const c = careerHighs[r.basePlayerId] ?? (careerHighs[r.basePlayerId] = {});
      for (const key of ["pts", "reb", "ast", "threes"]) {
        const v = Number(r.stats?.[key] ?? 0);
        if (v > (c[key] ?? 0)) c[key] = v;
      }
    }

    log(`  ${s}: ${rows.length} rows → ${t2Count} top-game entries`);
  }

  log(`\nTotal T2 entries across ${seasons.length} seasons: ${Object.keys(allTopGames).length}`);
  log(`T1 career-high players: ${Object.keys(careerHighs).length}`);

  if (!DRY_RUN) {
    writeFileSync(OUT_TOPGAMES, JSON.stringify(allTopGames, null, 2) + "\n", "utf8");
    writeFileSync(OUT_CAREER, JSON.stringify(careerHighs, null, 2) + "\n", "utf8");
    log(`Wrote ${OUT_TOPGAMES}`);
    log(`Wrote ${OUT_CAREER}`);
  } else {
    log("--dry-run: no files written");
  }
}

main();

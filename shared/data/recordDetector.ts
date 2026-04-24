/**
 * recordDetector.ts — Compare a stat line against records.
 * Returns RecordEvent[] for any broken or near records.
 */

import type { RecordEvent, TopGameResult, TopGameReason } from "../commentary/types";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "./nbaRecords";
import { MLB_SINGLE_GAME_RECORDS, MLB_STAT_ALIASES } from "./mlbRecords";
import { COMPOSITE_RULES, isCompositeCategory, type StatLine } from "./compositeCategories";
import { NBA_ALL_TIME_THRESHOLDS, type AllTimeThreshold } from "./nbaAllTimeThresholds";
import { MLB_ALL_TIME_THRESHOLDS } from "./mlbAllTimeThresholds";
import { WORLDCUP_ALL_TIME_THRESHOLDS } from "./worldcupAllTimeThresholds";
import topGamesBasketball from "../../basketball/public/data/topGames_2425.json";
import careerHighsBasketball from "../../basketball/public/data/careerHighs_2season.json";

function getStatValue(statLine: Record<string, any>, stat: string, aliases: Record<string, string[]>): number {
  const aliasList = aliases[stat] ?? [stat];
  for (const alias of aliasList) {
    const val = statLine[alias];
    if (val != null && typeof val === "number" && val > 0) return val;
  }
  return 0;
}

export function detectRecords(statLine: Record<string, any>, sport: string = "basketball"): RecordEvent[] {
  const records = sport === "baseball" ? MLB_SINGLE_GAME_RECORDS : NBA_SINGLE_GAME_RECORDS;
  const aliases = sport === "baseball" ? MLB_STAT_ALIASES : STAT_ALIASES;
  const events: RecordEvent[] = [];

  for (const rec of records) {
    const value = getStatValue(statLine, rec.stat, aliases);
    if (value <= 0) continue;

    if (value >= rec.record) {
      events.push({
        type: "record_broken",
        stat: rec.stat,
        value,
        record: rec.record,
        holder: rec.holder,
        label: `Broke ${rec.holder}'s ${rec.stat} record of ${rec.record}`,
      });
    } else if (value >= rec.record * rec.nearRecordPct) {
      events.push({
        type: "near_record",
        stat: rec.stat,
        value,
        record: rec.record,
        holder: rec.holder,
        label: `${value} ${rec.stat} — record is ${rec.record} (${rec.holder})`,
      });
    }
  }

  // Sort: record_broken first, then near_record
  events.sort((a, b) => (a.type === "record_broken" ? -1 : 1) - (b.type === "record_broken" ? -1 : 1));
  return events;
}

// ─── Top Games detection ─────────────────────────────────────────────────────

// ─── Lookup caching (per-sport) ─────────────────────────────────────────────

interface SportLookups {
  topGames: Record<string, { reasons: TopGameReason[] }>;
  careerHighs: Record<string, { pts?: number; reb?: number; ast?: number; threes?: number }>;
}

const DEFAULT_LOOKUPS: Record<string, SportLookups> = {};

let lookupsOverride: Record<string, SportLookups> | null = null;

/** Test hook — inject fake lookup maps. Production code should never call this. */
export function __setTopGameLookups(map: Record<string, SportLookups> | null): void {
  lookupsOverride = map;
}

function lookupsFor(sport: string): SportLookups {
  if (lookupsOverride?.[sport]) return lookupsOverride[sport];
  if (DEFAULT_LOOKUPS[sport]) return DEFAULT_LOOKUPS[sport];
  if (sport === "basketball") {
    DEFAULT_LOOKUPS[sport] = {
      topGames: topGamesBasketball as Record<string, { reasons: TopGameReason[] }>,
      careerHighs: careerHighsBasketball as Record<string, { pts?: number; reb?: number; ast?: number; threes?: number }>,
    };
  } else {
    DEFAULT_LOOKUPS[sport] = { topGames: {}, careerHighs: {} };
  }
  return DEFAULT_LOOKUPS[sport];
}

function thresholdsForSport(sport: string): AllTimeThreshold[] {
  switch (sport) {
    case "baseball": return MLB_ALL_TIME_THRESHOLDS;
    case "worldcup": return WORLDCUP_ALL_TIME_THRESHOLDS;
    default: return NBA_ALL_TIME_THRESHOLDS;
  }
}

function statValue(statLine: StatLine, category: string, sport: string): number {
  // Composites don't pull a single stat value — always 1 when rule matches.
  if (isCompositeCategory(category)) return 1;
  // Singles: use the existing alias-aware getter from the file above.
  const aliases = sport === "baseball" ? MLB_STAT_ALIASES : STAT_ALIASES;
  return getStatValue(statLine, category, aliases);
}

/**
 * Sort reasons within a tier:
 *  1. Higher `priority` wins.
 *  2. Tiebreaker: larger proportional delta above `min` wins.
 *     delta = (value - min) / min; composites get delta = Infinity (always win tiebreak).
 */
function sortReasons(
  reasons: Array<{ category: string; priority: number; min: number; value: number; label: string }>
): TopGameReason[] {
  return [...reasons]
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const deltaA = isCompositeCategory(a.category) ? Infinity : (a.value - a.min) / (a.min || 1);
      const deltaB = isCompositeCategory(b.category) ? Infinity : (b.value - b.min) / (b.min || 1);
      return deltaB - deltaA;
    })
    .map(({ category, label, value }) => ({ category, label, value }));
}

function detectT1(statLine: StatLine, sport: string): TopGameReason[] {
  const thresholds = thresholdsForSport(sport);
  const matches: Array<{ category: string; priority: number; min: number; value: number; label: string }> = [];

  for (const t of thresholds) {
    try {
      if (isCompositeCategory(t.category)) {
        const rule = COMPOSITE_RULES[t.category];
        if (rule(statLine)) {
          matches.push({ category: t.category, priority: t.priority, min: t.min, value: 1, label: t.label });
        }
      } else {
        const v = statValue(statLine, t.category, sport);
        if (v >= t.min) {
          matches.push({ category: t.category, priority: t.priority, min: t.min, value: v, label: t.label });
        }
      }
    } catch {
      // Skip this threshold on unexpected stat-line shape; never throw.
    }
  }

  return sortReasons(matches);
}

export function detectTopGame(
  statLine: StatLine,
  playerId: string,
  date: string,
  playerTier: string,
  sport: string = "basketball"
): TopGameResult {
  const empty: TopGameResult = { tier: null, primaryReason: null, allReasons: [] };
  if (!statLine || typeof statLine !== "object") return empty;

  // T1 — all-time thresholds
  const t1 = detectT1(statLine, sport);
  if (t1.length > 0) {
    return { tier: "all_time", primaryReason: t1[0], allReasons: t1 };
  }

  // T2 — season top-10 lookup
  const { topGames } = lookupsFor(sport);
  const key = `${playerId}|${date}`;
  const entry = topGames[key];
  if (entry?.reasons?.length) {
    return { tier: "season", primaryReason: entry.reasons[0], allReasons: entry.reasons };
  }

  // T3 — star career high (dataset-recent)
  const STAR_TIERS = new Set(["PURPLE", "ORANGE", "RED"]);
  if (!STAR_TIERS.has(playerTier)) return empty;

  const { careerHighs } = lookupsFor(sport);
  const highs = careerHighs[playerId];
  if (!highs) return empty;

  const CAREER_PRIORITY: Array<{ key: keyof typeof highs; label: (v: number) => string }> = [
    { key: "pts",    label: v => `best scoring night of the season so far (${v} pts)` },
    { key: "reb",    label: v => `biggest rebound night of the season so far (${v} reb)` },
    { key: "ast",    label: v => `best playmaking night of the season so far (${v} ast)` },
    { key: "threes", label: v => `best three-point night of the season so far (${v} threes)` },
  ];

  const t3Matches: TopGameReason[] = [];
  for (const { key, label } of CAREER_PRIORITY) {
    const max = highs[key as "pts" | "reb" | "ast" | "threes"];
    const val = statValue(statLine, key as string, sport);
    if (max != null && val > 0 && val === max) {
      t3Matches.push({ category: key as string, label: label(val), value: val });
    }
  }

  if (t3Matches.length > 0) {
    return { tier: "career", primaryReason: t3Matches[0], allReasons: t3Matches };
  }

  return empty;
}

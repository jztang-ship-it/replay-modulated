/**
 * recordDetector.ts — Compare a stat line against records, season top-10s,
 * and player career highs. Used for narrative commentary and Top Game tiers.
 *
 * Top Game tier hierarchy (highest first):
 *   T0 "record"  — broke or tied an all-time single-game record
 *   T1 "career"  — player's personal best in a tracked stat
 *   T2 "season"  — top-10 of the current season in a tracked stat
 * A game is reported only at the highest tier it qualifies for.
 */

import type { RecordEvent, TopGameResult, TopGameReason } from "../commentary/types";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "./nbaRecords";
import { MLB_SINGLE_GAME_RECORDS, MLB_STAT_ALIASES } from "./mlbRecords";
import topGamesBasketball from "../../basketball/public/data/topGames_2425.json";
import careerHighsBasketball from "../../basketball/public/data/careerHighs_2season.json";
import topGamesBaseball from "../../baseball/public/data/topGames.json";
import careerHighsBaseball from "../../baseball/public/data/careerHighs.json";

type StatLine = Record<string, any>;

function getStatValue(statLine: StatLine, stat: string, aliases: Record<string, string[]>): number {
  const aliasList = aliases[stat] ?? [stat];
  for (const alias of aliasList) {
    const val = statLine[alias];
    if (val != null && typeof val === "number" && val > 0) return val;
  }
  return 0;
}

function aliasesFor(sport: string): Record<string, string[]> {
  return sport === "baseball" ? MLB_STAT_ALIASES : STAT_ALIASES;
}

function recordsFor(sport: string) {
  return sport === "baseball" ? MLB_SINGLE_GAME_RECORDS : NBA_SINGLE_GAME_RECORDS;
}

export function detectRecords(statLine: StatLine, sport: string = "basketball"): RecordEvent[] {
  const records = recordsFor(sport);
  const aliases = aliasesFor(sport);
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

  events.sort((a, b) => (a.type === "record_broken" ? -1 : 1) - (b.type === "record_broken" ? -1 : 1));
  return events;
}

// ─── Top Games detection ─────────────────────────────────────────────────────

interface SportLookups {
  topGames: Record<string, { reasons: TopGameReason[] }>;
  careerHighs: Record<string, Record<string, number>>;
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
      careerHighs: careerHighsBasketball as Record<string, Record<string, number>>,
    };
  } else if (sport === "baseball") {
    DEFAULT_LOOKUPS[sport] = {
      topGames: topGamesBaseball as Record<string, { reasons: TopGameReason[] }>,
      careerHighs: careerHighsBaseball as Record<string, Record<string, number>>,
    };
  } else {
    DEFAULT_LOOKUPS[sport] = { topGames: {}, careerHighs: {} };
  }
  return DEFAULT_LOOKUPS[sport];
}

/**
 * T0 — all-time single-game record (broken or tied).
 * Returns one TopGameReason per record-tier hit, highest stat-value first.
 */
function detectRecordTier(statLine: StatLine, sport: string): TopGameReason[] {
  const records = recordsFor(sport);
  const aliases = aliasesFor(sport);
  const matches: Array<{ stat: string; value: number; record: number; holder: string }> = [];

  for (const rec of records) {
    const value = getStatValue(statLine, rec.stat, aliases);
    if (value > 0 && value >= rec.record) {
      matches.push({ stat: rec.stat, value, record: rec.record, holder: rec.holder });
    }
  }

  return matches
    .sort((a, b) => (b.value - b.record) - (a.value - a.record))
    .map(m => ({
      category: m.stat,
      label: m.value > m.record
        ? `broke the all-time ${m.stat} record (${m.value}, prev ${m.record} — ${m.holder})`
        : `tied the all-time ${m.stat} record of ${m.record} (${m.holder})`,
      value: m.value,
    }));
}

/** Career-high category lists per sport. Order = priority (first match wins on ties). */
const CAREER_CATEGORIES: Record<string, Array<{ key: string; label: (v: number) => string }>> = {
  basketball: [
    { key: "pts",    label: v => `personal best — ${v} pts` },
    { key: "reb",    label: v => `personal best — ${v} reb` },
    { key: "ast",    label: v => `personal best — ${v} ast` },
    { key: "threes", label: v => `personal best — ${v} threes` },
  ],
  baseball: [
    { key: "hr",  label: v => `personal best — ${v} HR` },
    { key: "h",   label: v => `personal best — ${v} hits` },
    { key: "rbi", label: v => `personal best — ${v} RBI` },
    { key: "k",   label: v => `personal best — ${v} K` },
    { key: "sb",  label: v => `personal best — ${v} SB` },
    { key: "ip",  label: v => `personal best — ${v} IP` },
  ],
};

/** T1 — player's career high (limited to star tiers). */
function detectCareerTier(
  statLine: StatLine,
  playerId: string,
  playerTier: string,
  sport: string
): TopGameReason[] {
  const STAR_TIERS = new Set(["PURPLE", "ORANGE", "RED"]);
  if (!STAR_TIERS.has(playerTier)) return [];

  const { careerHighs } = lookupsFor(sport);
  const highs = careerHighs[playerId];
  if (!highs) return [];

  const aliases = aliasesFor(sport);
  const cats = CAREER_CATEGORIES[sport] ?? CAREER_CATEGORIES.basketball;
  const matches: TopGameReason[] = [];
  for (const { key, label } of cats) {
    const max = highs[key];
    const val = getStatValue(statLine, key, aliases);
    if (max != null && val > 0 && val >= max) {
      matches.push({ category: key, label: label(val), value: val });
    }
  }
  return matches;
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

  // T0 — all-time record (broken or tied)
  const t0 = detectRecordTier(statLine, sport);
  if (t0.length > 0) {
    return { tier: "record", primaryReason: t0[0], allReasons: t0 };
  }

  // T1 — career high (star players only)
  const t1 = detectCareerTier(statLine, playerId, playerTier, sport);
  if (t1.length > 0) {
    return { tier: "career", primaryReason: t1[0], allReasons: t1 };
  }

  // T2 — season top-10 lookup
  const { topGames } = lookupsFor(sport);
  const entry = topGames[`${playerId}|${date}`];
  if (entry?.reasons?.length) {
    return { tier: "season", primaryReason: entry.reasons[0], allReasons: entry.reasons };
  }

  return empty;
}

/**
 * mlbRecords.ts — MLB single-game records and notable thresholds.
 */

import type { StatRecord } from "./nbaRecords";

export const MLB_SINGLE_GAME_RECORDS: StatRecord[] = [
  { stat: "h",       record: 7,  holder: "Wilbert Robinson",   date: "1892-06-10", nearRecordPct: 0.72 },
  { stat: "hr",      record: 4,  holder: "Multiple",           date: "various",    nearRecordPct: 0.75 },
  { stat: "rbi",     record: 12, holder: "Jim Bottomley",      date: "1924-09-16", nearRecordPct: 0.67 },
  { stat: "r",       record: 6,  holder: "Multiple",           date: "various",    nearRecordPct: 0.67 },
  { stat: "sb",      record: 6,  holder: "Multiple",           date: "various",    nearRecordPct: 0.67 },
  { stat: "k",       record: 21, holder: "Tom Cheney",         date: "1962-09-12", nearRecordPct: 0.76 },
  { stat: "ip",      record: 26, holder: "Leon Cadore",        date: "1920-05-01", nearRecordPct: 0.50 },
  { stat: "bb",      record: 6,  holder: "Multiple",           date: "various",    nearRecordPct: 0.83 },
];

export const MLB_STAT_ALIASES: Record<string, string[]> = {
  h: ["h", "hits", "H"],
  hr: ["hr", "homeRuns", "HR", "home_runs"],
  rbi: ["rbi", "RBI", "rbis"],
  r: ["r", "runs", "R"],
  sb: ["sb", "stolenBases", "SB", "stolen_bases"],
  k: ["k", "strikeouts", "K", "so", "SO"],
  ip: ["ip", "inningsPitched", "IP", "innings_pitched"],
  bb: ["bb", "walks", "BB"],
};

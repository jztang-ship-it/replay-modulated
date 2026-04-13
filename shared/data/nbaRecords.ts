/**
 * nbaRecords.ts — NBA single-game records and notable thresholds.
 * Small static table. Updated manually when records break.
 */

export interface StatRecord {
  stat: string;
  record: number;
  holder: string;
  date: string;
  nearRecordPct: number;
}

export const NBA_SINGLE_GAME_RECORDS: StatRecord[] = [
  { stat: "pts",       record: 100, holder: "Wilt Chamberlain",  date: "1962-03-02", nearRecordPct: 0.75 },
  { stat: "ast",       record: 30,  holder: "Scott Skiles",      date: "1990-12-30", nearRecordPct: 0.75 },
  { stat: "reb",       record: 55,  holder: "Wilt Chamberlain",  date: "1960-11-24", nearRecordPct: 0.75 },
  { stat: "stl",       record: 11,  holder: "Kendall Gill",      date: "1999-04-03", nearRecordPct: 0.73 },
  { stat: "blk",       record: 17,  holder: "Elmore Smith",      date: "1973-10-28", nearRecordPct: 0.75 },
  { stat: "threes",    record: 16,  holder: "Klay Thompson",     date: "2018-10-29", nearRecordPct: 0.75 },
  { stat: "turnovers", record: 14,  holder: "Jason Kidd",        date: "2000-11-17", nearRecordPct: 0.85 },
];

/** Stat key aliases — game logs use inconsistent keys. */
export const STAT_ALIASES: Record<string, string[]> = {
  pts: ["pts", "points", "PTS"],
  ast: ["ast", "assists", "AST"],
  reb: ["reb", "rebounds", "REB", "trb"],
  stl: ["stl", "steals", "STL"],
  blk: ["blk", "blocks", "BLK"],
  threes: ["fg3m", "threes", "3pm", "FG3M"],
  turnovers: ["turnovers", "tov", "TOV"],
};

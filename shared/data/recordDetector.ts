/**
 * recordDetector.ts — Compare a stat line against records.
 * Returns RecordEvent[] for any broken or near records.
 */

import type { RecordEvent } from "../commentary/types";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "./nbaRecords";
import { MLB_SINGLE_GAME_RECORDS, MLB_STAT_ALIASES } from "./mlbRecords";

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

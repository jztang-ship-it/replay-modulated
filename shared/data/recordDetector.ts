/**
 * recordDetector.ts — Compare a stat line against records.
 * Returns RecordEvent[] for any broken or near records.
 */

import type { RecordEvent } from "../commentary/types";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "./nbaRecords";

function getStatValue(statLine: Record<string, any>, stat: string): number {
  const aliases = STAT_ALIASES[stat] ?? [stat];
  for (const alias of aliases) {
    const val = statLine[alias];
    if (val != null && typeof val === "number" && val > 0) return val;
  }
  return 0;
}

export function detectRecords(statLine: Record<string, any>): RecordEvent[] {
  const events: RecordEvent[] = [];

  for (const rec of NBA_SINGLE_GAME_RECORDS) {
    const value = getStatValue(statLine, rec.stat);
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
        label: `${value} ${rec.stat} — NBA record is ${rec.record} (${rec.holder})`,
      });
    }
  }

  // Sort: record_broken first, then near_record
  events.sort((a, b) => (a.type === "record_broken" ? -1 : 1) - (b.type === "record_broken" ? -1 : 1));
  return events;
}

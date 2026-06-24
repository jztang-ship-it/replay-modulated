#!/usr/bin/env node
// scripts/build-boss-schedule.mjs
//
// Season-coupling (solo slate follows the boss): precompute the daily boss
// SEASON schedule so the client gate can pin solo play to the SAME season the
// boss writer resolves — without importing the boss resolver into the SPA.
//
// Why an artifact (not a client import): the canonical resolver chain
// (resolveBossForDate -> scheduleHeadline -> seededRng) depends on node:crypto,
// and bossGenerator.ts further pulls node:fs/path + the 213 MB seasons reader at
// module load. None of that can enter the basketball SPA bundle (no node
// polyfill). So we do the canonical selection ONCE here, at build time, and the
// gate reads a tiny pure-JSON answer. This is the exact pattern the boss bank
// itself uses (scripts/build-boss-bank.mjs -> bossBank.generated.json).
//
// SHARE, DON'T FORK: this calls the SAME scheduleHeadline + SCHEDULE_EPOCH the
// boss writer uses, over the SAME committed serveable pool (bank target != null).
// resolveBossForDate(date) returns sched[offset].boss; scheduleHeadline is
// prefix-stable (day d's pick depends only on days 0..d via the cooldown
// window), so one batched call for the whole horizon yields offset -> boss
// identically to per-date calls. The drift guard
// (shared/__tests__/bossSchedule.drift.test.ts) re-runs this builder AND asserts
// a sample of offsets equals resolveBossForDate's per-date output — so the
// artifact can never silently diverge from the server resolver.
//
// Run:  npm run build:boss-schedule   (then commit the regenerated JSON)

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scheduleHeadline, SCHEDULE_EPOCH } from "../basketball/src/tools/bossGenerator.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARTIFACT_PATH = resolve(HERE, "../shared/data/bossSchedule.generated.json");
const BANK_PATH = resolve(HERE, "../api/boss/_lib/bossBank.generated.json");

// Days from SCHEDULE_EPOCH to precompute. 10000 days (~27 years from
// 2026-06-22) is far past any plausible runtime date; regen extends it. The
// horizon-guard test fails as `today` approaches the end so it never silently
// runs off the end of the table.
export const HORIZON_DAYS = 10000;

export function buildBossScheduleArtifact() {
  const bank = JSON.parse(readFileSync(BANK_PATH, "utf8"));
  // SERVEABLE pool — identical to ensureDailyInstance.resolveBossForDate: only
  // bosses with a baked target enter the rotation, scheduled in bank order.
  const serveable = bank.bosses.filter((b) => b.target != null);
  // Canonical selection, batched: sched[d].boss is the boss for day-offset d
  // from the epoch (same as resolveBossForDate's sched[days-1] with days=d+1).
  const sched = scheduleHeadline(serveable, SCHEDULE_EPOCH, HORIZON_DAYS);
  const seasons = sched.map((s) => s.boss.season);
  return {
    _meta: {
      epoch: SCHEDULE_EPOCH,
      horizonDays: HORIZON_DAYS,
      bankVersion: bank._meta.version,
      generatedBy: "scripts/build-boss-schedule.mjs",
      note: "Precomputed daily boss SEASON schedule. seasons[dayOffsetFromEpoch] = the boss's season_code for that day. The gate pins solo play to this so slate==boss season. Regenerate via `npm run build:boss-schedule` whenever the serveable bank changes; drift-guarded by shared/__tests__/bossSchedule.drift.test.ts.",
    },
    // Index = whole-day offset from epoch (UTC). Value = boss season_code ("0304").
    seasons,
  };
}

/**
 * The exact committed-file string — one serialization path shared by the writer
 * here and the drift test, so byte-match is guaranteed by construction.
 * Compact (no indent): generated, drift-guarded, never hand-edited.
 */
export function bossScheduleArtifactString() {
  return JSON.stringify(buildBossScheduleArtifact()) + "\n";
}

// Guarded main — write only when run directly (not when imported by the test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(ARTIFACT_PATH, bossScheduleArtifactString());
  console.log("wrote", ARTIFACT_PATH);
}

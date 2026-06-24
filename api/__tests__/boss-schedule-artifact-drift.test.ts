/**
 * api/__tests__/boss-schedule-artifact-drift.test.ts
 *
 * Drift + anti-fork guard for the committed boss-season schedule artifact
 * (shared/data/bossSchedule.generated.json), consumed by the basketball gate to
 * pin solo play to the daily boss's season (season coupling).
 *
 * Two guarantees:
 *
 *  1. DRIFT — re-run the SAME builder the script uses and assert the committed
 *     file byte-matches. If someone changes the serveable bank / epoch / schedule
 *     code without `npm run build:boss-schedule`, the committed table and the live
 *     generation diverge and this goes red. (Same discipline as the bank artifact:
 *     boss-bank-artifact-drift.test.ts.)
 *
 *  2. ANTI-FORK — the gate must resolve the SAME season the boss writer does. The
 *     batched scheduleHeadline call in the builder must equal the canonical
 *     per-date resolveBossForDate the server uses. We sample offsets across the
 *     horizon and assert artifact.seasons[k] === resolveBossForDate(epoch+k).boss
 *     .season. If the batched build ever diverges from the per-date resolver, this
 *     goes red — which is exactly the bug season-coupling exists to prevent.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  bossScheduleArtifactString,
  buildBossScheduleArtifact,
  ARTIFACT_PATH,
} from "../../scripts/build-boss-schedule.mjs";

// Lazy proxy throws on ACCESS without SUPABASE_SERVICE_ROLE_KEY; importing
// resolveBossForDate (pure selection, never touches the client) only needs the
// import to not blow up. Same guard the ensure-daily-instance test uses.
vi.mock("../hand/_lib/supabaseServer.js", () => ({
  supabaseAdmin: {},
  supabaseAuth: {},
}));

import { resolveBossForDate, SCHEDULE_EPOCH } from "../boss/_lib/ensureDailyInstance.ts";

const DAY_MS = 86_400_000;
const epochMs = Date.parse(SCHEDULE_EPOCH + "T00:00:00Z");
const dateForOffset = (k: number) => new Date(epochMs + k * DAY_MS).toISOString().slice(0, 10);

describe("boss schedule artifact — drift guard", () => {
  it("committed bossSchedule.generated.json byte-matches a fresh regeneration", () => {
    const committed = readFileSync(ARTIFACT_PATH, "utf8");
    const regenerated = bossScheduleArtifactString();
    // If this fails: someone changed the serveable bank / epoch / schedule code
    // without running `npm run build:boss-schedule`. Rerun it and commit.
    expect(regenerated).toBe(committed);
  });
});

describe("boss schedule artifact — anti-fork (matches the canonical resolver)", () => {
  const { seasons } = buildBossScheduleArtifact();

  // Sample across the whole horizon (start, near-start, today-ish, and far out).
  const offsets = [0, 1, 2, 3, 7, 30, 100, 365, 1000, 5000, seasons.length - 1];

  it.each(offsets)(
    "offset %i: schedule season equals resolveBossForDate(...).boss.season",
    (k) => {
      const fromResolver = resolveBossForDate(dateForOffset(k), 0).boss.season;
      expect(seasons[k]).toBe(fromResolver);
    },
  );
});

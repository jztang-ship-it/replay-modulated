/**
 * api/__tests__/boss-artifact-fs-equivalence.test.ts
 *
 * Phase 2-fix, Commit 2 — proof the fs→static-import swap changed nothing
 * observable. resolveBossForDate now feeds scheduleHeadline from the committed
 * bossBank.generated.json instead of the fs join (loadBankBosses + loadBand +
 * loadBankVersion). This recomputes the OLD fs path inline and asserts, for
 * several fixed (date, slot), that the artifact-fed resolve yields a
 * byte-identical projectSenderFacing output, identity, and seed.
 *
 * This is the byte-identical regen guarantee (original Commit 2af4af7) extended
 * across the data-source swap: same (date, slot) → same boss roll, fs or bank.
 */
import { describe, it, expect, vi } from "vitest";

// Import guard: ensureDailyInstance imports supabaseAdmin (lazy proxy throws
// without the service-role key). We only exercise resolveBossForDate here.
vi.mock("../hand/_lib/supabaseServer.js", () => ({ supabaseAdmin: {}, supabaseAuth: {} }));

import { resolveBossForDate } from "../boss/_lib/ensureDailyInstance.ts";
import {
  materializeIdentity,
  dailyInstanceSeed,
  projectSenderFacing,
  loadBankVersion,
} from "../../basketball/src/tools/bossContract.ts";
import {
  loadBankBosses,
  scheduleHeadline,
  SCHEDULE_EPOCH,
  P_LO,
  P_HI,
} from "../../basketball/src/tools/bossGenerator.ts";
import { loadBand } from "../../basketball/src/tools/bossData.ts";

const DAY_MS = 86_400_000;

/** The OLD fs-join resolver, reconstructed verbatim — the baseline the swap
 *  must match byte-for-byte. */
function fsResolveBossForDate(date: string, slot: number) {
  const bankVersion = loadBankVersion();
  const pool = loadBankBosses().filter(b => b.tier === "champ" || b.tier === "iconic");
  const band = loadBand(P_LO, P_HI);
  const BAND: [number, number] = [band.lo, band.hi];
  const offsetDays = Math.floor(
    (Date.parse(date + "T00:00:00Z") - Date.parse(SCHEDULE_EPOCH + "T00:00:00Z")) / DAY_MS,
  );
  const days = Math.max(1, offsetDays + 1);
  const sched = scheduleHeadline(pool, SCHEDULE_EPOCH, days);
  const boss = sched[days - 1].boss;
  const identity = materializeIdentity(boss, bankVersion);
  const seed = dailyInstanceSeed(identity.identityId, date, slot, "daily", BAND, bankVersion, "daily");
  return { boss, identity, seed };
}

const CASES: Array<[string, number]> = [
  [SCHEDULE_EPOCH, 0], // the epoch day itself
  ["2026-08-01", 0],
  ["2026-09-15", 0],
  ["2026-08-01", 1], // a different slot → different roll, must still match fs
  ["2026-12-25", 0],
];

describe("Commit 2 — artifact-fed resolve is byte-identical to the fs path", () => {
  for (const [date, slot] of CASES) {
    it(`(${date}, slot ${slot}): projectSenderFacing + identity + seed match fs`, () => {
      const fromArtifact = resolveBossForDate(date, slot);
      const fromFs = fsResolveBossForDate(date, slot);

      // Same identity picked (the scheduleHeadline output over the same pool/order).
      expect(fromArtifact.identity).toEqual(fromFs.identity);
      // Same seed.
      expect(fromArtifact.seed).toEqual(fromFs.seed);

      // The observable payload — byte-identical serialization.
      const projArtifact = projectSenderFacing(fromArtifact.boss, fromArtifact.seed);
      const projFs = projectSenderFacing(fromFs.boss, fromFs.seed);
      expect(JSON.stringify(projArtifact)).toBe(JSON.stringify(projFs));
    });
  }
});

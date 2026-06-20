// api/boss/_lib/ensureDailyInstance.ts
//
// Phase 2 (boss delivery consumer), Commit 2. The instance WRITER — the
// social-rail consumer the contract (basketball/src/tools/bossContract.ts)
// deliberately stops before. Service-role only; lives under api/boss/_lib/
// (underscore-prefixed → Vercel does NOT auto-route it as a function, so it
// adds nothing to the 12/12 Hobby function cap — it's a lib called from a
// server context, exactly like api/hand/_lib/).
//
// What it does, per the brief:
//   1. Resolve today's identity for (date, slot) from the bank (v1.2) — REUSES
//      bossGenerator.scheduleHeadline (the canonical pick); does not
//      re-implement selection.
//   2. Build the instance via dailyInstanceSeed, project via
//      projectSenderFacing, map via toSharedChallengeRow.
//   3. Upsert idempotently on instance_key: first caller for the day creates
//      the row + uuid; every later caller resolves the SAME uuid. The writer
//      NEVER stores the rolled blob — only the projected sender-facing fields.
//
// Determinism (the guarantee comparison rests on) is pinned by the regen test
// in api/__tests__/boss-ensure-daily-instance.test.ts.

import { supabaseAdmin } from "../../hand/_lib/supabaseServer.js";
import {
  materializeIdentity,
  dailyInstanceSeed,
  projectSenderFacing,
  toSharedChallengeRow,
  loadBankVersion,
  type BossIdentity,
  type BossDailyInstanceSeed,
} from "../../../basketball/src/tools/bossContract.js";
import {
  loadBankBosses,
  scheduleHeadline,
  P_LO,
  P_HI,
  type Boss,
} from "../../../basketball/src/tools/bossGenerator.js";
import { loadBand } from "../../../basketball/src/tools/bossData.js";

// Inherited from the generator convention (bossGenerator.main() + the whole
// bossGenerator test suite all schedule from "2026-06-22"). The schedule's
// era anti-repeat cooldown means the canonical pick for a given day depends on
// the run from a FIXED start, so the epoch must be a stable constant — it is
// NOT a free per-call input. NOTE: this is a de-facto convention, not a
// design-doc lock; if a different production launch epoch is wanted it should
// be locked in docs/replaymod-design-decisions.md, not changed here silently.
export const SCHEDULE_EPOCH = "2026-06-22";

const DAY_MS = 86_400_000;

export type ResolvedBoss = {
  boss: Boss;
  identity: BossIdentity;
  seed: BossDailyInstanceSeed;
};

/**
 * Resolve the canonical boss identity + daily seed for (date, slot) by REUSING
 * scheduleHeadline from the fixed epoch. Heavy (reads the bank + season data +
 * band off disk); injected/mocked in tests via EnsureDeps.resolve so the unit
 * test stays hermetic.
 */
export function resolveBossForDate(date: string, slot: number): ResolvedBoss {
  const bankVersion = loadBankVersion();
  // Same pool the generator schedules over: champ + iconic.
  const pool = loadBankBosses().filter(b => b.tier === "champ" || b.tier === "iconic");
  const band = loadBand(P_LO, P_HI);
  const BAND: [number, number] = [band.lo, band.hi];

  // Run the schedule from the epoch through the requested day so the era
  // anti-repeat cooldown matches the canonical rotation. A date before the
  // epoch degrades to the epoch day's boss (days clamped to >= 1) — documented
  // fallback; production days are >= epoch.
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

export type EnsureDeps = {
  /** Identity/seed resolver. Defaults to resolveBossForDate; injected in tests. */
  resolve?: (date: string, slot: number) => ResolvedBoss;
  /** Supabase client. Defaults to the service-role supabaseAdmin; mocked in tests. */
  client?: typeof supabaseAdmin;
  /** Sport key for the row. Defaults to basketball (the only boss sport today). */
  sport?: string;
};

/**
 * Idempotent daily-instance writer. Returns the shared uuid challenge_id for
 * (date, slot). First caller creates the row; later callers resolve the same
 * uuid via the instance_key partial unique index.
 */
export async function ensureDailyInstance(
  date: string,
  slot = 0,
  deps: EnsureDeps = {},
): Promise<string> {
  const resolve = deps.resolve ?? resolveBossForDate;
  const client = deps.client ?? supabaseAdmin;
  const sport = deps.sport ?? "basketball";

  const { boss, identity, seed } = resolve(date, slot);
  const proj = projectSenderFacing(boss, seed);
  const row = toSharedChallengeRow(proj, seed, identity, sport);

  // The contract puts instanceId into challenge_id (doc-shape); the uuid PK
  // stays auto-generated, so route the natural key to instance_key and DROP
  // challenge_id from the write.
  const { challenge_id: instanceId, ...senderFacing } = row as Record<string, unknown> & {
    challenge_id: string;
  };

  // First-writer-wins idempotency on the partial unique index. We use
  // select-then-insert (not ON CONFLICT) because supabase-js can't express the
  // partial index predicate (WHERE instance_key IS NOT NULL) for ON CONFLICT
  // inference; the projection is deterministic so a DO-UPDATE would write
  // identical values anyway.
  const existing = await client
    .from("shared_challenges")
    .select("challenge_id")
    .eq("instance_key", instanceId)
    .maybeSingle();
  if (existing.data) return (existing.data as { challenge_id: string }).challenge_id;

  const insertPayload = {
    ...senderFacing,
    // ownerless boss — created_by is nullable as of migration 014; the human
    // insert policy was re-tightened in the same migration so this can't be
    // spoofed by an anon caller (boss writes bypass RLS via the service role).
    created_by: null,
    instance_key: instanceId,
    // shared_challenges.hand_id / slate_seed are NOT NULL with no default
    // (migration 005) and toSharedChallengeRow doesn't emit them. hand_id has
    // no FK, so a synthetic non-null value is safe; mirror create.ts's empty
    // slate_seed.
    hand_id: instanceId,
    slate_seed: "",
  };

  const ins = await client
    .from("shared_challenges")
    .insert(insertPayload)
    .select("challenge_id")
    .single();

  if (ins.error || !ins.data) {
    // Race: a concurrent caller inserted between our select and insert → the
    // unique index rejected us → re-resolve to the shared uuid.
    const retry = await client
      .from("shared_challenges")
      .select("challenge_id")
      .eq("instance_key", instanceId)
      .single();
    if (retry.error || !retry.data) {
      throw new Error(
        `ensureDailyInstance: upsert failed for ${instanceId}: ${ins.error?.message ?? retry.error?.message ?? "unknown"}`,
      );
    }
    return (retry.data as { challenge_id: string }).challenge_id;
  }

  return (ins.data as { challenge_id: string }).challenge_id;
}

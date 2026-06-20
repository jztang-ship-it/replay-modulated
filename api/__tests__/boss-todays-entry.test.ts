/**
 * api/__tests__/boss-todays-entry.test.ts
 *
 * Phase 2 (boss delivery consumer), Commit 5. The entry-point idempotency lock:
 * two calls to getTodaysBossChallengeId on the same (date, slot) resolve to the
 * SAME challenge_id (the shared-instance guarantee the daily UI links against).
 *
 * supabaseAdmin is mocked at the module boundary; the identity resolver +
 * client are injected so no bank/season disk loads run.
 */
import { describe, it, expect, vi } from "vitest";
import {
  dailyInstanceSeed,
  materializeIdentity,
} from "../../basketball/src/tools/bossContract.ts";
import type { Boss } from "../../basketball/src/tools/bossGenerator.ts";
import type { ResolvedBoss } from "../boss/_lib/ensureDailyInstance.ts";
import { getTodaysBossChallengeId, BOSS_SLOT } from "../boss/_lib/todaysBoss.ts";

vi.mock("../hand/_lib/supabaseServer.js", () => ({ supabaseAdmin: {}, supabaseAuth: {} }));

function synthBoss(): Boss {
  const starters = [0, 1, 2, 3, 4].map(i => ({
    name: `P${i}`, pos: ["PG", "SG", "SF", "PF", "C"][i],
    gamePool: [24, 26, 28, 30], gp: 70, avgMin: 34, meanFp: 27, traded: false,
  }));
  return {
    season: "2324", team: "BOS", starters,
    expected: 135, expectedRaw: 135, floor: 120, ceiling: 150, rollDepth: 70,
    startersComplete: true, tradedStarter: false, thin: null, gpFloor: 25,
    key: "BOS-2324", tier: "champ", era_id: "CELTICS_BANNER18",
    display: "Banner 18", flavor: "Tatum and Brown finish it",
  } as Boss;
}
const BAND: [number, number] = [120, 150];

function synthResolve(): (date: string, slot: number) => ResolvedBoss {
  return (date, slot) => {
    const boss = synthBoss();
    const identity = materializeIdentity(boss, "v1.2");
    const seed = dailyInstanceSeed(identity.identityId, date, slot, "daily", BAND, "v1.2", "daily");
    return { boss, identity, seed };
  };
}

// Shared mock client across calls — first insert wins, later calls re-resolve.
function makeClient() {
  const existing: Record<string, { challenge_id: string }> = {};
  const insertSpy = vi.fn();
  let autoId = 0;
  const builder = () => {
    const state: { op?: "select" | "insert"; key?: string; payload?: any } = {};
    const b: any = {};
    b.select = vi.fn(() => { state.op = state.op ?? "select"; return b; });
    b.eq = vi.fn((_c: string, v: string) => { state.key = v; return b; });
    b.insert = vi.fn((p: any) => { state.op = "insert"; state.payload = p; insertSpy(p); return b; });
    b.maybeSingle = vi.fn(() => Promise.resolve({ data: (state.key && existing[state.key]) || null, error: null }));
    b.single = vi.fn(() => {
      if (state.op === "insert") {
        const key = state.payload?.instance_key;
        const challenge_id = `uuid-${++autoId}`;
        if (key) existing[key] = { challenge_id };
        return Promise.resolve({ data: { challenge_id }, error: null });
      }
      const row = state.key ? existing[state.key] : undefined;
      return Promise.resolve({ data: row ?? null, error: row ? null : { message: "not found" } });
    });
    return b;
  };
  return { client: { from: vi.fn(() => builder()) } as any, insertSpy };
}

describe("Commit 5 — today's-boss entry point idempotency", () => {
  it("two calls on the same (date, slot) resolve to the same challenge_id", async () => {
    const { client, insertSpy } = makeClient();
    const deps = { resolve: synthResolve(), client };

    const first = await getTodaysBossChallengeId({ date: "2026-08-01", slot: BOSS_SLOT, deps });
    const second = await getTodaysBossChallengeId({ date: "2026-08-01", slot: BOSS_SLOT, deps });

    expect(second).toBe(first);
    // Shared instance: only the first call inserts.
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("defaults the slot to BOSS_SLOT (0) when omitted", async () => {
    const { client, insertSpy } = makeClient();
    const resolve = vi.fn(synthResolve());
    await getTodaysBossChallengeId({ date: "2026-08-02", deps: { resolve, client } });
    // resolve is called with the defaulted slot.
    expect(resolve).toHaveBeenCalledWith("2026-08-02", 0);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});

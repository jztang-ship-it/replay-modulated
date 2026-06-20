// basketball/src/tools/__tests__/bossContract.test.ts
//
// Pins the boss OUTPUT CONTRACT (definition only — no consumer):
//  (1) identity vs instance split, (3) seed-not-blob + regeneration determinism,
//  (5) sender-facing projection exposes ONLY the allowed fields. (2)/(4) mapping.

import { describe, it, expect } from "vitest";
import {
  materializeIdentity, dailyInstanceSeed, projectSenderFacing, toSharedChallengeRow,
} from "../bossContract";
import type { Boss } from "../bossGenerator";

function synthBoss(): Boss {
  const starters = [0, 1, 2, 3, 4].map(i => ({
    name: `P${i}`, pos: ["PG", "SG", "SF", "PF", "C"][i],
    gamePool: [24, 26, 28, 30], gp: 70, avgMin: 34, meanFp: 27, traded: false,
  }));
  return {
    season: "2324", team: "BOS", starters,
    expected: 135, expectedRaw: 135, floor: 120, ceiling: 150, rollDepth: 70,
    startersComplete: true, tradedStarter: false, thin: null, gpFloor: 25,
    key: "BOS-2324", tier: "champ", era_id: "CELTICS_BANNER18", display: "Banner 18", flavor: "Tatum and Brown finish it",
  };
}
const BAND: [number, number] = [120, 150];

describe("boss contract (1) — identity vs instance split", () => {
  it("identity is immutable curation + nominal five, no FP / no game pools", () => {
    const id = materializeIdentity(synthBoss(), "v1");
    expect(id.identityId).toBe("BOS-2324");
    expect(id.bankVersion).toBe("v1");
    expect(id.starters).toEqual([
      { name: "P0", pos: "PG" }, { name: "P1", pos: "SG" }, { name: "P2", pos: "SF" },
      { name: "P3", pos: "PF" }, { name: "P4", pos: "C" },
    ]);
    // no per-game pools / FP leaked into identity
    expect(JSON.stringify(id)).not.toMatch(/gamePool|ceiling|floor|expected/);
  });
  it("instance seed is date+slot keyed and stamps the bank version", () => {
    const s = dailyInstanceSeed("BOS-2324", "2026-07-01", 0, "daily", BAND, "v1", "daily");
    expect(s.instanceId).toBe("2026-07-01|0|BOS-2324");
    expect(s.bankVersion).toBe("v1");
  });
});

describe("boss contract (3) — seed-not-blob + deterministic regeneration", () => {
  it("the instance seed stores params, NOT the rolled result", () => {
    const s = dailyInstanceSeed("BOS-2324", "2026-07-01", 0, "daily", BAND, "v1", "daily");
    expect(s.seedParams).toMatchObject({ mode: "daily", band: BAND });
    expect(s).not.toHaveProperty("totalToBeat");
    expect(s).not.toHaveProperty("presentedFive");
    expect(JSON.stringify(s)).not.toMatch(/totalToBeat|presentedFive|picks/);
  });
  it("regenerating from the same (boss, seed) is identical (no stored blob needed)", () => {
    const boss = synthBoss();
    const s = dailyInstanceSeed("BOS-2324", "2026-07-01", 0, "daily", BAND, "v1", "daily");
    expect(projectSenderFacing(boss, s)).toEqual(projectSenderFacing(boss, s));
  });
});

describe("boss contract (5) — sender-facing exposes ONLY the allowed fields", () => {
  const boss = synthBoss();
  const s = dailyInstanceSeed("BOS-2324", "2026-07-01", 0, "daily", BAND, "v1", "daily");
  const p = projectSenderFacing(boss, s);

  it("top-level keys are exactly {sender, totalToBeat, presentedFive, toughDay}", () => {
    expect(Object.keys(p).sort()).toEqual(["presentedFive", "sender", "totalToBeat", "toughDay"]);
  });
  it("sender is a non-human boss {kind, name, flavor}", () => {
    expect(p.sender).toEqual({ kind: "boss", name: "Banner 18", flavor: "Tatum and Brown finish it" });
  });
  it("presentedFive items are exactly {name,pos,fp} — no game index / internals", () => {
    expect(p.presentedFive).toHaveLength(5);
    for (const c of p.presentedFive) expect(Object.keys(c).sort()).toEqual(["fp", "name", "pos"]);
  });
  it("NO rejection/ceiling/band/attempt internals leak anywhere in the projection", () => {
    expect(JSON.stringify(p)).not.toMatch(/attempt|ceiling|floor|band|rejection|dailyHit|raidHit|status|\bgi\b|\bK\b|route/i);
  });
});

describe("boss contract (2) — maps onto the existing challenge receive path (non-human sender)", () => {
  const boss = synthBoss();
  const id = materializeIdentity(boss, "v1");
  const s = dailyInstanceSeed("BOS-2324", "2026-07-01", 0, "daily", BAND, "v1", "daily");
  const row = toSharedChallengeRow(projectSenderFacing(boss, s), s, id, "basketball");

  it("reuses shared_challenges columns with a non-human sender marker", () => {
    expect(row.sender_kind).toBe("boss");          // the only added marker
    expect(row.challenger_name).toBe("Banner 18"); // existing column carries the boss name
    expect(row.target_fp).toBeTypeOf("number");    // existing total-to-beat column
    expect((row.initial_roster as any).cards).toHaveLength(5); // existing snapshot shape
    expect(row.trigger_type).toBe("boss");
    expect(row.boss_bank_version).toBe("v1");
  });
});

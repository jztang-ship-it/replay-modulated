// basketball/src/tools/__tests__/bossGenerator.test.ts
//
// Step 3 — boss generator acceptance tests (all band-agnostic). Per the brief +
// review decisions: determinism, band-membership, schedule cooldown, '17 Warriors
// raid-capable, authored naming, FP-identity, and the new headliner-in-band ≥95%
// (tough-day ≤5%) at K=15. Test #4 (handicap routing) is DELETED — real data
// falsified defensive-low-FP; there is no handicap route.

import { describe, it, expect, beforeAll } from "vitest";
import {
  seededRng, rollBoss, rollGames, scheduleHeadline, rollDistribution,
  loadBankBosses, K, COOLDOWN, type Boss,
} from "../bossGenerator";
import { buildSeason, buildAll, loadBand, canonicalFp } from "../bossData";
import { computeBasketballFp } from "../../adapters/fantasyPoints";
import { computeBasketballBadges } from "../../adapters/badges";
import { BasketballSportConfig } from "../../adapters/basketballConfig";

// ── Synthetic bosses (hermetic — no data load) ────────────────────────────────
function synthBoss(key: string, era_id: string, gameVal: number[], tier = "champ"): Boss {
  const starters = [0, 1, 2, 3, 4].map(i => ({
    name: `P${i}`, pos: ["PG", "SG", "SF", "PF", "C"][i],
    gamePool: gameVal, gp: 70, avgMin: 34, meanFp: gameVal.reduce((a, b) => a + b, 0) / gameVal.length, traded: false,
  }));
  const sums = (f: (n: number[]) => number) => starters.reduce((a, s) => a + f(s.gamePool), 0);
  return {
    season: key.slice(-4), team: key.slice(0, 3), starters,
    expected: sums(p => p.reduce((a, b) => a + b, 0) / p.length),
    expectedRaw: sums(p => p.reduce((a, b) => a + b, 0) / p.length),
    floor: sums(p => Math.min(...p)), ceiling: sums(p => Math.max(...p)),
    rollDepth: 70, startersComplete: true, tradedStarter: false, thin: null, gpFloor: 25,
    key, tier, era_id, display: key, flavor: "",
  };
}

// Shared real-data fixtures (built once).
let bank: Boss[];
let band: [number, number];
beforeAll(() => {
  bank = loadBankBosses();
  const b = loadBand(60, 85);
  band = [b.lo, b.hi];
});

describe("Step 3 #1 — determinism (same date ⇒ identical boss)", () => {
  it("synthetic: two rolls of the same (day,slot,boss,mode,band) are identical", () => {
    const boss = synthBoss("DET-0304", "PISTONS", [20, 28, 34, 41, 26]);
    const a = rollBoss(boss, "2026-07-01", 0, "daily", [120, 180]);
    const c = rollBoss(boss, "2026-07-01", 0, "daily", [120, 180]);
    expect(a.total).toBe(c.total);
    expect(a.picks.map(p => p.gi)).toEqual(c.picks.map(p => p.gi));
  });
  it("real boss: two daily rolls of the same day are identical", () => {
    const boss = bank.find(b => b.key === "DEN-2223")!;
    const a = rollBoss(boss, "2026-07-01", 0, "daily", band).total;
    const c = rollBoss(boss, "2026-07-01", 0, "daily", band).total;
    expect(a).toBe(c);
  });
  it("seededRng stream is deterministic by key", () => {
    const r1 = seededRng("x", 1, "y"); const r2 = seededRng("x", 1, "y");
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe("Step 3 #2 — band-membership", () => {
  it("an in_band daily roll lands within [lo,hi]", () => {
    // games 24..28 → 5×~26 ≈ 130 ∈ [120,150]
    const boss = synthBoss("BOS-0708", "CELTICS", [24, 25, 26, 27, 28]);
    const r = rollBoss(boss, "2026-07-02", 0, "daily", [120, 150]);
    expect(r.status).toBe("in_band");
    expect(r.total).toBeGreaterThanOrEqual(120);
    expect(r.total).toBeLessThanOrEqual(150);
  });
  it("a raid roll clears P85 (≥ hi)", () => {
    const boss = synthBoss("GSW-1617", "GSW_KD", [40, 42, 44, 46, 48]); // min 200 ≥ 150
    const r = rollBoss(boss, "2026-07-02", 0, "raid", [120, 150]);
    expect(r.status).toBe("raid");
    expect(r.total).toBeGreaterThanOrEqual(150);
  });
});

describe("Step 3 #3 — schedule cooldown (no identity-era within COOLDOWN days)", () => {
  it("60-day real-bank schedule has zero era repeats within cooldown", () => {
    const pool = bank.filter(b => b.tier === "champ" || b.tier === "iconic");
    const sched = scheduleHeadline(pool, "2026-06-22", 60);
    const eras = sched.map(s => s.boss.era_id);
    const violations = eras
      .map((e, i) => eras.slice(Math.max(0, i - COOLDOWN), i).includes(e) ? i : -1)
      .filter(i => i >= 0);
    expect(violations).toEqual([]);
  });
});

describe("Step 3 #5 — '17 Warriors route to raid (raid-capable), out of forced-daily", () => {
  it("GSW-1617 reaches ≥P85 (emergent raid eligibility)", () => {
    const gsw = buildSeason("1617").find(t => t.team === "GSW")!;
    const boss: Boss = { ...gsw, key: "GSW-1617", tier: "champ", era_id: "GSW_KD", display: "The Super-Team", flavor: "" };
    const d = rollDistribution(boss, band, 1000);
    expect(d.raidHit).toBeGreaterThan(0); // distribution reaches P85+ → raid-capable
    const r = rollBoss(boss, "2026-07-03", 0, "raid", band);
    expect(r.status).toBe("raid");
    expect(r.total).toBeGreaterThanOrEqual(band[1]);
  });
});

describe("Step 3 #6 — authored naming (not Mad-Libs)", () => {
  it("the first 10 scheduled headliners all carry a non-empty authored bank name", () => {
    const pool = bank.filter(b => b.tier === "champ" || b.tier === "iconic");
    const sched = scheduleHeadline(pool, "2026-06-22", 10);
    for (const { boss } of sched) {
      expect(boss.display.trim().length).toBeGreaterThan(0);
      expect(boss.display).not.toMatch(/\bundefined\b|\{.*\}/); // no template placeholder leaked
    }
  });
});

describe("Step 3 #7 — FP IDENTITY (boss FP and player FP are one code path)", () => {
  it("canonicalFp === computeBasketballFp + computeBasketballBadges on a fixed stat line", () => {
    const stats = { pts: 30, reb: 8, ast: 7, stl: 2, blk: 1, turnovers: 3, min: 36, fg3m: 4 };
    const direct = computeBasketballFp({ ...stats, _position: "PG" }, BasketballSportConfig.projectionWeights)
      + computeBasketballBadges({ ...stats, _position: "PG" }, (BasketballSportConfig as any).badges ?? []).reduce((a: number, b: any) => a + (b.fp ?? 0), 0);
    expect(canonicalFp(stats, "PG")).toBe(direct);
  });
  it("on a badge-free stat line, canonicalFp delegates exactly to computeBasketballFp", () => {
    // No-badge line (no FP-bonus predicate fires) ⇒ canonicalFp == computeBasketballFp
    // with zero badge bonus — proving the boss FP core IS the player's computeBasketballFp,
    // not a parallel implementation.
    const s = { pts: 10, reb: 5, ast: 5, stl: 1, blk: 1, turnovers: 1, min: 30 };
    expect(computeBasketballBadges({ ...s, _position: "SF" }, (BasketballSportConfig as any).badges ?? [])).toHaveLength(0);
    expect(canonicalFp(s, "SF")).toBe(computeBasketballFp({ ...s, _position: "SF" }, BasketballSportConfig.projectionWeights));
  });
});

describe("locked-36 — active bank set after cuts + promotions", () => {
  it("loadBankBosses returns exactly 36 active identities", () => {
    expect(bank.length).toBe(36);
  });
  it("cut identities are excluded (active:false): MIA-1112, OKC-1112, MEM-1213", () => {
    const keys = new Set(bank.map(b => b.key));
    for (const cut of ["MIA-1112", "OKC-1112", "MEM-1213", "GSW-2122"]) expect(keys.has(cut)).toBe(false);
  });
  it("promotions are present and iconic: LAC-1314, PHI-1819, HOU-1920, GSW-0607", () => {
    for (const id of ["LAC-1314", "PHI-1819", "HOU-1920", "GSW-0607", "TOR-0001"]) {
      const b = bank.find(x => x.key === id);
      expect(b, id).toBeDefined();
      expect(b!.tier).toBe("iconic");
    }
  });
  it("promotion overrides applied: PHI-1819 Redick (not Covington); HOU-1920 House (not Capela); DEN-0607 JR Smith (not Andre Miller)", () => {
    const phi = bank.find(b => b.key === "PHI-1819")!.starters.map(s => s.name);
    expect(phi).toContain("JJ Redick");
    expect(phi).not.toContain("Robert Covington");
    const hou = bank.find(b => b.key === "HOU-1920")!.starters.map(s => s.name);
    expect(hou).toContain("Danuel House Jr.");
    expect(hou).not.toContain("Clint Capela");
    const den = bank.find(b => b.key === "DEN-0607")!.starters.map(s => s.name);
    expect(den).toContain("JR Smith");
    expect(den).not.toContain("Andre Miller");
  });
});

describe("five-override — applied to listed identities, gated off everywhere else", () => {
  it("GSW-1718 boss five has Iguodala (override in), not Quinn Cook (auto out)", () => {
    const names = bank.find(b => b.key === "GSW-1718")!.starters.map(s => s.name);
    expect(names).toContain("Andre Iguodala");
    expect(names).not.toContain("Quinn Cook");
  });
  it("DAL-1011 boss five has Chandler (override in) and retains Marion, not Caron Butler", () => {
    const names = bank.find(b => b.key === "DAL-1011")!.starters.map(s => s.name);
    expect(names).toContain("Tyson Chandler");
    expect(names).toContain("Shawn Marion");
    expect(names).not.toContain("Caron Butler");
  });
  it("a non-overridden identity (DEN-2223) is unchanged", () => {
    const names = bank.find(b => b.key === "DEN-2223")!.starters.map(s => s.name);
    expect(names).toContain("Nikola Jokić");
  });
  it("gating: buildAll() WITHOUT overrides keeps the auto five (Quinn Cook in GSW-1718) — Step-1 table / selection rule unaffected", () => {
    const gsw = buildAll().find(t => t.season === "1718" && t.team === "GSW")!;
    expect(gsw.starters.map(s => s.name)).toContain("Quinn Cook");
  });
});

describe("Step 3 #new — headliner in-band ≥95% of days (tough-day ≤5%) at K=15", () => {
  it("K constant is 15", () => { expect(K).toBe(15); });
  it("over a 120-day real schedule, ≥95% of headline days land in-band", () => {
    const pool = bank.filter(b => b.tier === "champ" || b.tier === "iconic");
    const sched = scheduleHeadline(pool, "2026-06-22", 120);
    const days = sched.map(({ day, boss }) => rollBoss(boss, day, 0, "daily", band));
    const toughDays = days.filter(r => r.status === "tough_day").length;
    const inBandFrac = 1 - toughDays / days.length;
    expect(inBandFrac).toBeGreaterThanOrEqual(0.95); // tough-day ≤5% across the schedule
  });
});

/**
 * Phase 2-mount Step 1 — draft-fresh deal mechanic.
 *
 * Locks the load-bearing invariant of Interpretation 3: a boss recipient
 * drafts a FRESH OWN roster from the boss's season, EXCLUDING the boss's
 * own five (which stay the opponent via resolvedSenderHand). The collision
 * the map flags — "initialRoster MUST be distinct from resolvedSenderHand" —
 * is enforced here: the boss five can never appear in the fresh draft.
 *
 * The fetch/singleton-coupled half of dealFreshRoster (setActiveSeason +
 * ensureLoaded) matches dealInitialRoster's glass-verified boundary; the
 * NEW decision — the boss-five exclusion — is the pure, decoupled core and
 * is unit-locked here against the REAL generateRoster (no mocks).
 */
import { describe, it, expect } from "vitest";
import { excludeBossFive } from "../gameAdapter";
import { generateRoster, mulberry32 } from "@shared/engines/rosterEngine";
import { DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";
import type { PlayerEval } from "@shared/types";

function ev(base: string, salary: number, tier: string): PlayerEval {
  return {
    id: base,
    basePlayerId: base,
    personKey: base,
    cardId: `${base}-c`,
    name: `P-${base}`,
    team: "TST",
    season: "2425",
    position: "G",
    projectedFp: 30,
    salary,
    tier: tier as PlayerEval["tier"],
  };
}

const BOSS = ["boss1", "boss2", "boss3", "boss4", "boss5"];
const OTHERS = Array.from({ length: 12 }, (_, i) => `other${i}`);
// Cheap enough that 5 draftable non-boss players fit under the $250 cap.
const pool: PlayerEval[] = [
  ...BOSS.map((b) => ev(b, 60, "ORANGE")),
  ...OTHERS.map((o, i) => ev(o, 30 + (i % 5), i < 3 ? "ORANGE" : "PURPLE")),
];
const econ = { ...DEFAULT_ECONOMY_CONFIG, capMax: 250 };
const config = {
  rosterSize: 5,
  slotRequirements: [] as never[],
  excludeFromFlex: [] as string[],
  positionAware: false,
};

describe("excludeBossFive (Phase 2-mount Step 1 draft-fresh)", () => {
  it("removes exactly the boss-five base ids from the eval pool", () => {
    const filtered = excludeBossFive(pool, new Set(BOSS));
    expect(filtered).toHaveLength(OTHERS.length);
    expect(filtered.some((e) => BOSS.includes(e.basePlayerId))).toBe(false);
  });

  it("matches on basePlayerId, leaving non-boss players untouched", () => {
    const filtered = excludeBossFive(pool, new Set(BOSS));
    expect(filtered.map((e) => e.basePlayerId).sort()).toEqual([...OTHERS].sort());
  });

  it("returns the pool unchanged when the exclusion set is empty", () => {
    const filtered = excludeBossFive(pool, new Set<string>());
    expect(filtered.map((e) => e.basePlayerId)).toEqual(pool.map((e) => e.basePlayerId));
  });

  it("a fresh draft from the excluded pool never contains a boss-five player", () => {
    const filtered = excludeBossFive(pool, new Set(BOSS));
    const roster = generateRoster(filtered, config as never, econ, mulberry32(123));
    expect(roster).toHaveLength(5);
    expect(roster.every((c) => !BOSS.includes(c.basePlayerId))).toBe(true);
  });
});

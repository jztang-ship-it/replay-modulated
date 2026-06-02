// shared/utils/__tests__/enrichInitialRosterForChallenge.test.ts
//
// Phase 0 challenge-snapshot-enrichment. Verifies the create-site merge
// of resolved wasHeld/actualFp onto the starting hand, the part the lock
// flags as the real logic ("test it directly, not just the serializer").
// See docs/challenge-landing-v2-phase0-snapshot-enrichment-lock.md.

import { describe, expect, it } from "vitest";
import type { GeneratedCard } from "@shared/types/index";
import { enrichInitialRosterForChallenge } from "../enrichInitialRosterForChallenge";

function makeCard(overrides: Partial<GeneratedCard>): GeneratedCard {
  return {
    id: "x",
    basePlayerId: "x",
    personKey: "x",
    cardId: "x",
    name: "X",
    team: "TEAM",
    season: "2024-25",
    position: "G",
    salary: 50,
    tier: "BLUE",
    slotIndex: 0,
    projectedFp: 20,
    actualFp: 0,
    fpDelta: 0,
    statLine: {},
    gameInfo: { date: "", opponent: "" },
    achievements: [],
    wasHeld: false,
    ...overrides,
  } as GeneratedCard;
}

describe("enrichInitialRosterForChallenge — Phase 0 create-site merge", () => {
  it("copies wasHeld:true and actualFp from the resolved card for a held starting card", () => {
    const initial = [
      makeCard({ basePlayerId: "p1", slotIndex: 0, name: "Vucevic" }),
      makeCard({ basePlayerId: "p2", slotIndex: 1, name: "Embiid" }),
    ];
    const resolved = [
      makeCard({ basePlayerId: "p1", slotIndex: 0, name: "Vucevic", wasHeld: true, actualFp: 42.5 }),
      makeCard({ basePlayerId: "p2", slotIndex: 1, name: "Embiid",  wasHeld: false, actualFp: 31.0 }),
    ];
    const out = enrichInitialRosterForChallenge(initial, resolved);
    expect(out[0].wasHeld).toBe(true);
    expect(out[0].actualFp).toBe(42.5);
    // p2 was NOT held by sender; copy through false/31 from the resolved
    // roster (same player in same slot).
    expect(out[1].wasHeld).toBe(false);
    expect(out[1].actualFp).toBe(31.0);
  });

  it("keeps wasHeld:false and actualFp:0 for a discarded starting card (no basePlayerId match in resolved)", () => {
    // The sender discarded p1 (redrew that slot). p1 is not in resolved.
    // The slot in resolved has a different player (q1).
    const initial = [
      makeCard({ basePlayerId: "p1", slotIndex: 0, name: "Vucevic" }),
      makeCard({ basePlayerId: "p2", slotIndex: 1, name: "Embiid" }),
    ];
    const resolved = [
      makeCard({ basePlayerId: "q1", slotIndex: 0, name: "Redraw",  wasHeld: false, actualFp: 22.0 }),
      makeCard({ basePlayerId: "p2", slotIndex: 1, name: "Embiid",  wasHeld: true,  actualFp: 51.0 }),
    ];
    const out = enrichInitialRosterForChallenge(initial, resolved);
    // p1 was discarded — never played, no actualFp known. Stays false/0
    // (the slotIndex fallback must NOT pick up q1's wasHeld:false or its
    // actualFp; that would silently report the redrawn card's outcome on
    // the discarded starting card).
    expect(out[0].wasHeld).toBe(false);
    expect(out[0].actualFp).toBe(0);
    // p2 was held — outcome comes through.
    expect(out[1].wasHeld).toBe(true);
    expect(out[1].actualFp).toBe(51.0);
  });

  it("does not mutate the input arrays or cards", () => {
    const initial = [makeCard({ basePlayerId: "p1", slotIndex: 0 })];
    const resolved = [makeCard({ basePlayerId: "p1", slotIndex: 0, wasHeld: true, actualFp: 33 })];
    const initialCopy = JSON.parse(JSON.stringify(initial));
    enrichInitialRosterForChallenge(initial, resolved);
    expect(initial).toEqual(initialCopy);
  });

  it("preserves all other GeneratedCard fields on the enriched cards", () => {
    const initial = [makeCard({ basePlayerId: "p1", slotIndex: 0, name: "Vucevic", team: "ORL", tier: "PURPLE", salary: 65 })];
    const resolved = [makeCard({ basePlayerId: "p1", slotIndex: 0, wasHeld: true, actualFp: 40 })];
    const [out] = enrichInitialRosterForChallenge(initial, resolved);
    expect(out.name).toBe("Vucevic");
    expect(out.team).toBe("ORL");
    expect(out.tier).toBe("PURPLE");
    expect(out.salary).toBe(65);
  });

  // Recon (a) — defensive test for the slotIndex-fallback guard. The
  // helper's safety depends on redrawn cards in resolvedRoster carrying
  // wasHeld:false. Proven from shared/engines/rosterEngine.ts:129 / :150
  // / :318 / :338 / :369 (every redraw path explicitly sets wasHeld:false,
  // and toGeneratedCard hardcodes it on the rebuilt card) and
  // shared/engines/resolveEngine.ts:67 (resolveCards spreads-then-
  // overrides actualFp/fpDelta/gameInfo/statLine/achievements but does
  // NOT touch wasHeld, so the engine invariant carries through). This
  // test pins the contract: discard-vs-redraw at the same slot keeps the
  // discard false/0 even when the redrawn card has a high actualFp that
  // would otherwise be tempting to copy over.
  it("slot-collision case: discarded starting card at slot N + redrawn card at slot N (wasHeld:false) → discard stays false/0", () => {
    const initial = [
      makeCard({ basePlayerId: "p1", slotIndex: 0, name: "Vucevic" }),
      makeCard({ basePlayerId: "p2", slotIndex: 1, name: "Embiid" }),
    ];
    const resolved = [
      // p1 discarded; slot 0 now occupied by redrawn q1 with a HIGH actualFp.
      // The slotIndex-fallback in enrichment only matches a wasHeld:true
      // card, so q1's actualFp must NOT bleed onto p1.
      makeCard({ basePlayerId: "q1", slotIndex: 0, name: "Mobley",
                wasHeld: false, actualFp: 99 }),
      makeCard({ basePlayerId: "p2", slotIndex: 1, name: "Embiid",
                wasHeld: true,  actualFp: 47 }),
    ];
    const out = enrichInitialRosterForChallenge(initial, resolved);
    expect(out[0].wasHeld).toBe(false);
    expect(out[0].actualFp).toBe(0);
    expect(out[1].wasHeld).toBe(true);
    expect(out[1].actualFp).toBe(47);
  });

  it("nothing-held hand: all starting cards stay false but with the resolved actualFp", () => {
    // Sender held nothing; every slot redrew. resolved has different
    // basePlayerIds than initial. All starting cards report wasHeld:false,
    // actualFp:0 (no resolved match by id, slotIndex fallback blocked by
    // wasHeld:false on the slot occupant).
    const initial = [
      makeCard({ basePlayerId: "p1", slotIndex: 0 }),
      makeCard({ basePlayerId: "p2", slotIndex: 1 }),
    ];
    const resolved = [
      makeCard({ basePlayerId: "q1", slotIndex: 0, wasHeld: false, actualFp: 10 }),
      makeCard({ basePlayerId: "q2", slotIndex: 1, wasHeld: false, actualFp: 15 }),
    ];
    const out = enrichInitialRosterForChallenge(initial, resolved);
    expect(out.every(c => c.wasHeld === false)).toBe(true);
    expect(out.every(c => c.actualFp === 0)).toBe(true);
  });
});

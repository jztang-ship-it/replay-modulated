// basketball/src/adapters/__tests__/SportAdapter.snapshot.test.ts
//
// Phase 0 challenge-snapshot-enrichment. Round-trip, legacy, validator,
// and holdsRecorded coverage for the basketball override of
// serializeRoster/deserializeRoster. Mirrors shared/adapters/__tests__/
// SportAdapter.snapshot.test.ts. See docs/challenge-landing-v2-phase0-
// snapshot-enrichment-lock.md.

import { describe, expect, it } from "vitest";
import { sportAdapter } from "../SportAdapter";
import type { GeneratedCard } from "@shared/types/index";

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

// Basketball roster size is 6 — validateRosterSnapshot enforces it.
function sixCards(overrideAt: Record<number, Partial<GeneratedCard>> = {}): GeneratedCard[] {
  return Array.from({ length: 6 }, (_, i) =>
    makeCard({
      basePlayerId: `p${i + 1}`,
      personKey: `p${i + 1}`,
      cardId: `c${i + 1}`,
      name: `Player ${i + 1}`,
      slotIndex: i,
      ...(overrideAt[i] ?? {}),
    }),
  );
}

describe("basketball SportAdapter.serializeRoster — Phase 0 enrichment fields", () => {
  it("writes top-level holdsRecorded:true and sport:'basketball'", () => {
    const snap = sportAdapter.serializeRoster(sixCards());
    expect((snap as any).holdsRecorded).toBe(true);
    expect((snap as any).sport).toBe("basketball");
    expect((snap as any).v).toBe(1);
  });

  it("writes wasHeld + actualFp per card", () => {
    const snap = sportAdapter.serializeRoster(
      sixCards({
        0: { wasHeld: true,  actualFp: 42.5 },
        3: { wasHeld: false, actualFp: 8.0  },
      }),
    );
    const cards = (snap as any).cards;
    expect(cards[0].wasHeld).toBe(true);
    expect(cards[0].actualFp).toBe(42.5);
    expect(cards[3].wasHeld).toBe(false);
    expect(cards[3].actualFp).toBe(8.0);
  });
});

describe("basketball SportAdapter round-trip", () => {
  it("preserves per-card wasHeld and actualFp through serialize→deserialize", () => {
    const enriched = sixCards({
      0: { wasHeld: true,  actualFp: 42.5 },
      1: { wasHeld: true,  actualFp: 51.0 },
      2: { wasHeld: false, actualFp: 0    },
    });
    const snap = sportAdapter.serializeRoster(enriched);
    const out = sportAdapter.deserializeRoster(snap as any);
    expect(out[0].wasHeld).toBe(true);
    expect(out[0].actualFp).toBe(42.5);
    expect(out[1].wasHeld).toBe(true);
    expect(out[1].actualFp).toBe(51.0);
    expect(out[2].wasHeld).toBe(false);
    expect(out[2].actualFp).toBe(0);
  });
});

describe("basketball SportAdapter legacy snapshot", () => {
  it("deserializes wasHeld:false and actualFp:0 when fields are absent", () => {
    const legacy = {
      v: 1,
      sport: "basketball",
      cards: Array.from({ length: 6 }, (_, i) => ({
        id: `p${i + 1}`, basePlayerId: `p${i + 1}`, personKey: `p${i + 1}`,
        cardId: `c${i + 1}`, name: `Player ${i + 1}`, team: "ORL",
        season: "2024-25", position: "G", photoCode: null,
        salary: 50, tier: "BLUE", slotIndex: i, projectedFp: 20,
      })),
    };
    const out = sportAdapter.deserializeRoster(legacy);
    expect(out.every(c => c.wasHeld === false)).toBe(true);
    expect(out.every(c => c.actualFp === 0)).toBe(true);
    expect((legacy as any).holdsRecorded).toBeUndefined();
  });
});

describe("basketball SportAdapter.validateRosterSnapshot", () => {
  it("accepts the enriched snapshot", () => {
    const snap = sportAdapter.serializeRoster(
      sixCards({ 0: { wasHeld: true, actualFp: 30 } }),
    );
    expect(sportAdapter.validateRosterSnapshot(snap)).toBe(true);
  });

  it("still accepts a legacy snapshot (no holdsRecorded/wasHeld/actualFp)", () => {
    const legacy = {
      v: 1,
      sport: "basketball",
      cards: Array.from({ length: 6 }, (_, i) => ({
        basePlayerId: `p${i + 1}`, name: `Player ${i + 1}`,
        tier: "BLUE", salary: 50,
      })),
    };
    expect(sportAdapter.validateRosterSnapshot(legacy)).toBe(true);
  });
});

// shared/adapters/__tests__/SportAdapter.snapshot.test.ts
//
// Phase 0 challenge-snapshot-enrichment. Round-trip, legacy-fallback,
// validator-accept, and holdsRecorded coverage for the shared adapter.
// See docs/challenge-landing-v2-phase0-snapshot-enrichment-lock.md.
// Basketball overrides this adapter; its parallel tests live under
// basketball/src/adapters/__tests__.

import { describe, expect, it } from "vitest";
import { SportAdapter } from "../SportAdapter";
import type { SportConfigShape } from "../../types";
import type { GeneratedCard } from "../../types/index";

const STUB_CONFIG: SportConfigShape = {
  sportKey: "stub",
  displayName: "Stub",
  salaryCap: 100,
  positions: ["F"],
  rosterSlots: ["F", "F"],
  maxPlayers: 2,
  projectionWeights: { pts: 1 },
  statCategories: ["pts"],
} as unknown as SportConfigShape;

function makeCard(overrides: Partial<GeneratedCard>): GeneratedCard {
  return {
    id: "x",
    basePlayerId: "x",
    personKey: "x",
    cardId: "x",
    name: "X",
    team: "TEAM",
    season: "2024-25",
    position: "F",
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

describe("SportAdapter.serializeRoster — Phase 0 enrichment fields", () => {
  it("writes top-level holdsRecorded:true", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    const snap = adapter.serializeRoster([
      makeCard({ basePlayerId: "p1", wasHeld: true, actualFp: 30 }),
    ]);
    expect((snap as any).holdsRecorded).toBe(true);
    expect((snap as any).v).toBe(1);
  });

  it("writes wasHeld + actualFp per card", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    const snap = adapter.serializeRoster([
      makeCard({ basePlayerId: "p1", wasHeld: true,  actualFp: 42.5 }),
      makeCard({ basePlayerId: "p2", wasHeld: false, actualFp: 0    }),
    ]);
    const cards = (snap as any).cards;
    expect(cards[0].wasHeld).toBe(true);
    expect(cards[0].actualFp).toBe(42.5);
    expect(cards[1].wasHeld).toBe(false);
    expect(cards[1].actualFp).toBe(0);
  });
});

describe("SportAdapter round-trip — serialize → deserialize preserves wasHeld + actualFp", () => {
  it("preserves per-card wasHeld and actualFp through round-trip", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    const enriched = [
      makeCard({ basePlayerId: "p1", name: "Vucevic", wasHeld: true,  actualFp: 42.5 }),
      makeCard({ basePlayerId: "p2", name: "Embiid",  wasHeld: false, actualFp: 0    }),
    ];
    const snap = adapter.serializeRoster(enriched);
    const out = adapter.deserializeRoster(snap as any);
    expect(out[0].basePlayerId).toBe("p1");
    expect(out[0].wasHeld).toBe(true);
    expect(out[0].actualFp).toBe(42.5);
    expect(out[1].basePlayerId).toBe("p2");
    expect(out[1].wasHeld).toBe(false);
    expect(out[1].actualFp).toBe(0);
  });
});

describe("SportAdapter legacy snapshot — no new fields", () => {
  it("deserializes wasHeld:false and actualFp:0 when the snapshot lacks the fields", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    // Synthesize a pre-Phase-0 snapshot: no holdsRecorded, no wasHeld,
    // no actualFp on the cards.
    const legacy = {
      v: 1,
      sport: "stub",
      cards: [
        { id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1",
          name: "Vucevic", team: "ORL", season: "2024-25", position: "F",
          photoCode: null, salary: 50, tier: "BLUE", slotIndex: 0,
          projectedFp: 20 },
      ],
    };
    const out = adapter.deserializeRoster(legacy);
    expect(out[0].wasHeld).toBe(false);
    expect(out[0].actualFp).toBe(0);
    // holdsRecorded is read from the raw snapshot by the landing — absent
    // on legacy rows means "don't render hold-dependent UI."
    expect((legacy as any).holdsRecorded).toBeUndefined();
  });
});

describe("SportAdapter.validateRosterSnapshot — accepts enriched snapshot", () => {
  it("accepts a snapshot with wasHeld + actualFp + holdsRecorded:true", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    const snap = adapter.serializeRoster([
      makeCard({ basePlayerId: "p1", wasHeld: true,  actualFp: 30 }),
      makeCard({ basePlayerId: "p2", wasHeld: false, actualFp: 12 }),
    ]);
    expect(adapter.validateRosterSnapshot(snap)).toBe(true);
  });

  it("still accepts a legacy snapshot without the new fields", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    const legacy = {
      v: 1,
      sport: "stub",
      cards: [
        { basePlayerId: "p1", name: "Vucevic", tier: "BLUE", salary: 50 },
      ],
    };
    expect(adapter.validateRosterSnapshot(legacy)).toBe(true);
  });
});

// shared/utils/__tests__/handStatus.test.ts
//
// Pins the hand-status bands + their tier-orthogonality. Heater ≥ heaterMin,
// Cold Night < coldMax, null between. Status sits ON TOP of any tier, so a
// LEGEND-range total can still be a Heater.

import { describe, expect, it } from "vitest";
import { getHandStatus } from "../handStatus";

// Basketball's absolute bands (the only sport that wires getHandStatus today).
const HEATER_MIN = 255;
const COLD_NIGHT_MAX = 120;
const status = (fp: number) => getHandStatus(fp, HEATER_MIN, COLD_NIGHT_MAX);

describe("getHandStatus — absolute, sparse, tier-orthogonal", () => {
  it("HEATER at and above the floor (inclusive)", () => {
    expect(status(255)).toBe("HEATER");
    expect(status(300)).toBe("HEATER");
  });
  it("no HEATER just below the floor", () => {
    expect(status(254)).toBeNull();
    expect(status(254.9)).toBeNull();
  });
  it("COLD_NIGHT strictly below the ceiling", () => {
    expect(status(119)).toBe("COLD_NIGHT");
    expect(status(0)).toBe("COLD_NIGHT");
    expect(status(-10)).toBe("COLD_NIGHT");
  });
  it("the coldMax value itself is neutral (exclusive ceiling)", () => {
    expect(status(120)).toBeNull();
  });
  it("null across the broad middle (most hands)", () => {
    expect(status(120)).toBeNull();
    expect(status(185)).toBeNull(); // STARTER cut — still no status
    expect(status(207)).toBeNull(); // ALL-STAR cut
    expect(status(246)).toBeNull(); // LEGEND cut — high tier, still not a Heater
    expect(status(254)).toBeNull();
  });
  it("status is orthogonal to tier: a LEGEND-range total can be a Heater", () => {
    // LEGEND starts at 246; Heater at 255. A 260-FP hand is BOTH.
    expect(status(260)).toBe("HEATER");
  });
});

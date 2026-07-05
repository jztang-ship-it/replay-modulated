// shared/crowd/__tests__/readDraw.test.ts — the descriptive read×draw classifier.
// Config defaults: fadeChalk 0.55 (own ≤ 0.45 = contrarian), cold ratio ≤ 0.40,
// warm ratio ≥ 1.6. Pure; no valence asserted (labels are descriptions).
import { describe, expect, it } from "vitest";
import {
  classifyReadDraw,
  readStance,
  drawState,
  READ_DRAW_COLD,
  READ_DRAW_WARM,
  DEFAULT_READ_DRAW_CONFIG,
  type ReadDrawCard,
} from "../readDraw";

// own → fade. contrarian = fade ≥ 0.55 → own ≤ 0.45; chalk = own > 0.45.
const CONTRARIAN_OWN = 0.30; // fade 70%
const CHALK_OWN = 0.62; // fade 38%

const card = (over: Partial<ReadDrawCard> = {}): ReadDrawCard => ({
  playerId: "p", name: "Test", wasHeld: true,
  actualFp: 30, projectedFp: 30, ownership: CHALK_OWN,
  ...over,
});

describe("readStance (READ axis — ownership only today)", () => {
  it("contrarian when fade ≥ fadeChalk (room was OFF him)", () => {
    expect(readStance(card({ ownership: CONTRARIAN_OWN }))).toBe("contrarian");
  });
  it("chalk when fade < fadeChalk (room was WITH him)", () => {
    expect(readStance(card({ ownership: CHALK_OWN }))).toBe("chalk");
  });
  it("boundary: fade EXACTLY at fadeChalk is contrarian (≥, inclusive)", () => {
    // fade = 1 − own = fadeChalk exactly.
    const own = 1 - DEFAULT_READ_DRAW_CONFIG.fadeChalk; // 0.45
    expect(readStance(card({ ownership: own }))).toBe("contrarian");
  });
  it("boundary: fade a hair below fadeChalk is chalk", () => {
    const own = 1 - DEFAULT_READ_DRAW_CONFIG.fadeChalk + 0.001;
    expect(readStance(card({ ownership: own }))).toBe("chalk");
  });
});

describe("drawState (DRAW axis — actualFp / projectedFp)", () => {
  it("cold when ratio ≤ COLD", () => {
    expect(drawState(card({ actualFp: 10, projectedFp: 30 }))).toBe("cold"); // 0.33
  });
  it("warm when ratio ≥ WARM", () => {
    expect(drawState(card({ actualFp: 60, projectedFp: 30 }))).toBe("warm"); // 2.0
  });
  it("neutral between COLD and WARM", () => {
    expect(drawState(card({ actualFp: 30, projectedFp: 30 }))).toBe("neutral"); // 1.0
  });
  it("boundary: ratio EXACTLY at COLD (0.40) is cold (≤, inclusive)", () => {
    expect(drawState(card({ actualFp: READ_DRAW_COLD * 50, projectedFp: 50 }))).toBe("cold"); // 20/50 = 0.40
  });
  it("boundary: ratio a hair above COLD is neutral", () => {
    expect(drawState(card({ actualFp: READ_DRAW_COLD * 50 + 0.1, projectedFp: 50 }))).toBe("neutral");
  });
  it("boundary: ratio EXACTLY at WARM (1.6) is warm (≥, inclusive)", () => {
    expect(drawState(card({ actualFp: READ_DRAW_WARM * 50, projectedFp: 50 }))).toBe("warm"); // 80/50 = 1.6
  });
  it("boundary: ratio a hair below WARM is neutral", () => {
    expect(drawState(card({ actualFp: READ_DRAW_WARM * 50 - 0.1, projectedFp: 50 }))).toBe("neutral");
  });
  it("no baseline (projectedFp ≤ 0) → neutral (no draw signal)", () => {
    expect(drawState(card({ actualFp: 40, projectedFp: 0 }))).toBe("neutral");
  });
});

describe("classifyReadDraw (the 2×3 quadrant grid)", () => {
  it("labels every HELD card; excludes non-held (a call you MADE)", () => {
    const out = classifyReadDraw([
      card({ playerId: "a", name: "Held", wasHeld: true }),
      card({ playerId: "b", name: "Rerolled", wasHeld: false }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].playerId).toBe("a");
  });

  it("all four corners + both neutrals resolve to the right quadrant", () => {
    const cards: ReadDrawCard[] = [
      card({ playerId: "1", name: "ContraCold", ownership: CONTRARIAN_OWN, actualFp: 8, projectedFp: 40 }),  // 0.20
      card({ playerId: "2", name: "ContraWarm", ownership: CONTRARIAN_OWN, actualFp: 80, projectedFp: 40 }), // 2.0
      card({ playerId: "3", name: "ContraNeut", ownership: CONTRARIAN_OWN, actualFp: 40, projectedFp: 40 }), // 1.0
      card({ playerId: "4", name: "ChalkCold", ownership: CHALK_OWN, actualFp: 8, projectedFp: 40 }),
      card({ playerId: "5", name: "ChalkWarm", ownership: CHALK_OWN, actualFp: 80, projectedFp: 40 }),
      card({ playerId: "6", name: "ChalkNeut", ownership: CHALK_OWN, actualFp: 40, projectedFp: 40 }),
    ];
    const q = classifyReadDraw(cards).map((l) => l.quadrant);
    expect(q).toEqual([
      "contrarian-cold", "contrarian-warm", "contrarian-neutral",
      "chalk-cold", "chalk-warm", "chalk-neutral",
    ]);
  });

  it("quadrant === `${read}-${draw}` (structured, not a copy string)", () => {
    const [l] = classifyReadDraw([card({ ownership: CONTRARIAN_OWN, actualFp: 8, projectedFp: 40 })]);
    expect(l.read).toBe("contrarian");
    expect(l.draw).toBe("cold");
    expect(l.quadrant).toBe(`${l.read}-${l.draw}`);
    // descriptive only — no valence fields leak into the label
    expect(Object.keys(l).sort()).toEqual(["draw", "name", "playerId", "quadrant", "read"]);
  });

  it("empty roster → empty labels", () => {
    expect(classifyReadDraw([])).toEqual([]);
  });
});

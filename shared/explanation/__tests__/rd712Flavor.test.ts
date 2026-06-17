// RD7.12 — margin bucket, box extraction, flavor-card selection, and the
// CAUSE/RECOGNITION FROZEN-OUTPUT regression lock (tightening #3).
import { describe, it, expect } from "vitest";
import {
  explainResolution,
  flavorMarginBucket,
  shouldAuthorFlavor,
  extractFlavorBox,
  selectFlavorCard,
  type YourCardFact,
} from "../resolutionEngine";

const c = (o: Partial<YourCardFact>): YourCardFact => ({
  name: "Filler X", tier: "BLUE", salary: 30, wasHeld: true, fp: 40,
  percentile: 50, poolMedian: 40, nickname: null, ...o,
});
const fill = (n: number) => Array.from({ length: n }, (_, i) => c({ name: `N${i} X` }));

describe("flavorMarginBucket — beatdown boundary (tightening #2)", () => {
  it("buckets at the locked thresholds", () => {
    expect(flavorMarginBucket(0)).toBe("tie");
    expect(flavorMarginBucket(1.5)).toBe("tie");      // TIE_EPS
    expect(flavorMarginBucket(3)).toBe("win");
    expect(flavorMarginBucket(14)).toBe("win");
    expect(flavorMarginBucket(-24.9)).toBe("close-loss");  // just under BLOWOUT_MARGIN
    expect(flavorMarginBucket(-25)).toBe("beatdown");      // BLOWOUT_MARGIN → beatdown
    expect(flavorMarginBucket(-60)).toBe("beatdown");
  });
});

describe("RD7.12-b — shouldAuthorFlavor gate (call LLM only where it earns its keep)", () => {
  it("predicate matrix", () => {
    expect(shouldAuthorFlavor(20, "variance")).toBe(true);   // win (variance) → LLM
    expect(shouldAuthorFlavor(20, "agency")).toBe(true);     // win (agency)   → LLM
    expect(shouldAuthorFlavor(-12, "agency")).toBe(true);    // close-loss + agency → LLM
    expect(shouldAuthorFlavor(-12, "variance")).toBe(false); // close-loss + variance → deterministic
    expect(shouldAuthorFlavor(-40, "agency")).toBe(false);   // beatdown → deterministic
    expect(shouldAuthorFlavor(0, "variance")).toBe(false);   // tie → deterministic
  });

  it("AGENCY-classified close-loss (A2 bust) → gate OPEN (model called)", () => {
    const input = { yourCards: [c({ name: "Devin Booker", tier: "ORANGE", salary: 62, wasHeld: true, fp: 12, percentile: 6, poolMedian: 50, statLine: { pts: 8, reb: 2, ast: 1 } }), ...fill(5)], margin: -12 };
    const { classification } = explainResolution(input);
    expect(classification.register).toBe("agency");
    expect(shouldAuthorFlavor(input.margin, classification.register)).toBe(true);
  });

  it("VARIANCE-classified close-loss (slate fell, no single call) → gate CLOSED (deterministic, no model call)", () => {
    const input = { yourCards: fill(6), margin: -10 };
    const { classification } = explainResolution(input);
    expect(classification.register).toBe("variance");
    expect(shouldAuthorFlavor(input.margin, classification.register)).toBe(false);
  });
});

describe("extractFlavorBox — basketball-shaped; null for non-basketball/sparse", () => {
  it("extracts present box keys", () => {
    expect(extractFlavorBox({ pts: 41, reb: 12, ast: 9, stl: 2, min: 39 })).toEqual({ pts: 41, reb: 12, ast: 9, stl: 2 });
  });
  it("null when no scoring key (non-basketball) or absent", () => {
    expect(extractFlavorBox({ hits: 3, ab: 4 })).toBeNull();
    expect(extractFlavorBox(null)).toBeNull();
    expect(extractFlavorBox(undefined)).toBeNull();
  });
});

describe("selectFlavorCard — decisive (agency) or top scorer (variance)", () => {
  it("picks the decisive card on an agency hand", () => {
    const input = { yourCards: [c({ name: "Nikola Jokić", tier: "RED", salary: 89, wasHeld: true, fp: 113, percentile: 96, poolMedian: 73, statLine: { pts: 41, reb: 12, ast: 9 } }), ...fill(5)], margin: 31 };
    const r = explainResolution(input);
    expect(selectFlavorCard(r.classification, input)?.name).toBe("Nikola Jokić");
  });
  it("null when no card has a usable box line", () => {
    const input = { yourCards: fill(6), margin: 14 };
    const r = explainResolution(input);
    expect(selectFlavorCard(r.classification, input)).toBeNull();
  });
});

// TIGHTENING #3 — the honesty-critical Recognition + Cause output is FROZEN.
// These exact strings are RD7.11's engine output; RD7.12 added only new exports
// and touched no render/classify code. Any future change that perturbs the
// shared engine codepath breaks this lock.
describe("FROZEN-OUTPUT: agency line = RD8 Register A (fantasy-scalar token, not the RD7.11 box triple)", () => {
  it("A1 held-star line is unchanged", () => {
    const input = { yourCards: [c({ name: "Nikola Jokić", tier: "RED", salary: 89, wasHeld: true, fp: 113, percentile: 96, poolMedian: 73, nickname: "the Joker", statLine: { pts: 41, reb: 12, ast: 9, min: 39 } }), ...fill(5)], margin: 31 };
    expect(explainResolution(input).text).toBe("Jokić's 113 — exactly why you held him. Classic the Joker.");
  });
  it("A2 held-bust line is unchanged", () => {
    const input = { yourCards: [c({ name: "Devin Booker", tier: "ORANGE", salary: 62, wasHeld: true, fp: 14, percentile: 6, poolMedian: 50, nickname: "Book", statLine: { pts: 8, reb: 2, ast: 1, min: 30 } }), ...fill(5)], margin: -12 };
    expect(explainResolution(input).text).toBe("Just 14 from Booker — the hold you stuck with. Not Book's night.");
  });
  it("beatdown variance line — RD8 system-variance framing (no opponent-board agency)", () => {
    // Was "Mike's whole board went off"; RD8 retired the agency/heat verb on the
    // opponent's board. The slate/math is the subject; it fell the opponent's way.
    expect(explainResolution({ yourCards: fill(6), margin: -40 }).text).toBe("A 40.0-point gap — the math fell Mike's way, no single call to fix.");
  });
});

describe("RD7.12-c — diversified variance closer + beatdown tail gate", () => {
  const hero = (box: Record<string, number>, over: Partial<YourCardFact> = {}) =>
    c({ name: "Kevin Garnett", tier: "BLUE", salary: 30, wasHeld: true, fp: 50, percentile: 60, poolMedian: 48, statLine: box, ...over });

  it("CHANGE 2: beatdown loss (with a box-bearing top card) has NO consolation tail", () => {
    const input = { yourCards: [hero({ pts: 24, reb: 8, ast: 5 }, { tier: "RED", fp: 37, poolMedian: 37 }), ...fill(5)], margin: -40 };
    const { text, classification } = explainResolution(input);
    expect(classification.register).toBe("variance");
    expect(text).not.toMatch(/24-8-5/);                                  // top card's box NOT appended
    expect(text.toLowerCase()).not.toMatch(/high mark|topped|led the box|stood out|led it|fell short/);
  });

  it("below threshold (close-loss variance) DOES still get a diversified closer", () => {
    // a card-naming OR a no-card closer, but something descriptive is appended
    const input = { yourCards: [hero({ pts: 24, reb: 8, ast: 5 }), ...fill(5)], margin: -10 };
    const { text, classification } = explainResolution(input);
    expect(classification.register).toBe("variance");
    expect(text.toLowerCase()).toMatch(/24-8-5|no single line|ran cold|came up|short|led it/);
  });

  it("CHANGE 1: variance closers emit >1 STRUCTURAL shape (not all name-stat-ranking)", () => {
    const lines: string[] = [];
    for (let mg = 5; mg <= 24; mg++) {
      const input = { yourCards: [hero({ pts: 24, reb: 7, ast: 6 }), ...fill(5)], margin: mg };
      const r = explainResolution(input);
      if (r.classification.register === "variance") lines.push(r.text);
    }
    const cardNaming = lines.filter((t) => /24-7-6/.test(t));
    const noCard = lines.filter((t) => /on balance|spread across|Decided by/i.test(t));
    expect(cardNaming.length).toBeGreaterThan(0); // at least one names the card
    expect(noCard.length).toBeGreaterThan(0);     // at least one names NO card → >1 shape
  });
});

// RD7.12 — margin bucket, box extraction, flavor-card selection, and the
// CAUSE/RECOGNITION FROZEN-OUTPUT regression lock (tightening #3).
import { describe, it, expect } from "vitest";
import {
  explainResolution,
  flavorMarginBucket,
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
describe("FROZEN-OUTPUT: engine Recognition+Cause byte-identical to RD7.11", () => {
  it("A1 held-star line is unchanged", () => {
    const input = { yourCards: [c({ name: "Nikola Jokić", tier: "RED", salary: 89, wasHeld: true, fp: 113, percentile: 96, poolMedian: 73, nickname: "the Joker", statLine: { pts: 41, reb: 12, ast: 9, min: 39 } }), ...fill(5)], margin: 31 };
    expect(explainResolution(input).text).toBe("Jokić's 41-12-9 — exactly why you held him. Classic the Joker.");
  });
  it("A2 held-bust line is unchanged", () => {
    const input = { yourCards: [c({ name: "Devin Booker", tier: "ORANGE", salary: 62, wasHeld: true, fp: 14, percentile: 6, poolMedian: 50, nickname: "Book", statLine: { pts: 8, reb: 2, ast: 1, min: 30 } }), ...fill(5)], margin: -12 };
    expect(explainResolution(input).text).toBe("Just 8-2-1 from Booker — the hold that sank it. Not Book's night.");
  });
  it("beatdown variance line is unchanged", () => {
    expect(explainResolution({ yourCards: fill(6), margin: -40 }).text).toBe("Lost by 40.0 — Mike's whole board went off. Not your night.");
  });
});

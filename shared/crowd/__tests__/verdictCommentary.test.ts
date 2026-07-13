// shared/crowd/__tests__/verdictCommentary.test.ts
// The results-box composer's own guard: severity lands in the right band, budget is never
// exceeded, the dare is present on contrarian-cold / absent on chalk, neutral stays silent,
// and a mild hand composes SHORT while a loud hand fills the budget.
import { describe, it, expect } from "vitest";
import { composeVerdictCommentary, VERDICT_COMMENTARY_BUDGET, type VerdictLeadFacts } from "../verdictCommentary";
import type { ReadDrawQuadrant } from "../readDraw";

const lead = (quadrant: ReadDrawQuadrant, o: Partial<VerdictLeadFacts> = {}): VerdictLeadFacts => ({
  quadrant, name: "Sengun", fadePct: 65, ratio: quadrant.endsWith("cold") ? 0.30 : 1.8, fp: 20, ...o,
});

describe("composeVerdictCommentary — neutral silent, budget, dare rules", () => {
  it("neutral (null lead) → empty string (caller keeps its non-quadrant copy)", () => {
    expect(composeVerdictCommentary(null, "STARTER", 205)).toBe("");
  });

  it("never exceeds the ~180-char budget across all quadrants + bands + a long name + notable tier", () => {
    const names = ["X", "Nickeil Alexander-Walker", "Giannis Antetokounmpo"];
    const quadrants: ReadDrawQuadrant[] = ["contrarian-cold", "contrarian-warm", "chalk-cold", "chalk-warm"];
    const colds = [0.05, 0.20, 0.38];
    const warms = [2.4, 1.8, 1.62];
    const fades = [72, 65, 57, 47, 50, 54];
    for (const q of quadrants) for (const name of names) for (const r of (q.endsWith("cold") ? colds : warms)) for (const fadePct of fades) {
      for (const totalFp of [160, 210, 260]) {
        const out = composeVerdictCommentary(lead(q, { name, ratio: r, fadePct, fp: 12 }), totalFp >= 255 ? "LEGEND" : "BUST", totalFp);
        expect(out.length).toBeLessThanOrEqual(VERDICT_COMMENTARY_BUDGET);
      }
    }
  });

  it("dare 'Your turn?' present on contrarian-cold, absent on chalk quadrants", () => {
    expect(composeVerdictCommentary(lead("contrarian-cold", { ratio: 0.10, fp: 5 }), "BUST", 168)).toMatch(/Your turn\?$/);
    expect(composeVerdictCommentary(lead("chalk-cold", { ratio: 0.10, fp: 5 }), "BUST", 168)).not.toMatch(/Your turn\?/);
    expect(composeVerdictCommentary(lead("chalk-warm", { ratio: 2.2, fp: 31 }), "STARTER", 210)).not.toMatch(/Your turn\?/);
  });

  it("severity bands: loud cold no-shows, mid comes up short, mild is bare (short)", () => {
    const loud = composeVerdictCommentary(lead("contrarian-cold", { ratio: 0.05, fp: 5.2, fadePct: 72 }), "BUST", 168);
    const mid = composeVerdictCommentary(lead("contrarian-cold", { ratio: 0.30, fp: 7.9, fadePct: 61 }), "STARTER", 205);
    const mild = composeVerdictCommentary(lead("contrarian-cold", { ratio: 0.38, fp: 9.0, fadePct: 57 }), "STARTER", 205);
    expect(loud).toMatch(/no-showed/);
    expect(loud).toMatch(/a tenth of his number/);
    expect(mid).toMatch(/came up a third short/);
    expect(mild).toMatch(/just came up short/);
    // mild has NO number/fade clause and is SHORTER than the loud fill.
    expect(mild).not.toMatch(/FP\)/);
    expect(mild).not.toMatch(/% off him/);
    expect(mild.length).toBeLessThan(loud.length);
  });

  it("fade only shown when readSev >= mid (mild read = no fade clause, subordinate not dramatized)", () => {
    const midRead = composeVerdictCommentary(lead("contrarian-cold", { ratio: 0.30, fp: 7.9, fadePct: 66 }), "STARTER", 205);
    const mildRead = composeVerdictCommentary(lead("contrarian-cold", { ratio: 0.30, fp: 7.9, fadePct: 57 }), "STARTER", 205);
    expect(midRead).toMatch(/66% off him/);
    expect(mildRead).not.toMatch(/% off him/);
  });

  it("tier clause only when notable (LEGEND / brutal-BUST), silent when middling", () => {
    const legend = composeVerdictCommentary(lead("contrarian-warm", { ratio: 2.4, fp: 66, fadePct: 71 }), "LEGEND", 260);
    const middling = composeVerdictCommentary(lead("contrarian-warm", { ratio: 2.4, fp: 66, fadePct: 71 }), "ALL_STAR", 228);
    expect(legend).toMatch(/LEGEND board/);
    expect(middling).not.toMatch(/LEGEND board|brutal/);
  });
});

// shared/crowd/__tests__/quadrantLine.test.ts — descriptive quadrant copy.
// Renders one line per draw-extreme held card; ungraded (no correct/optimal).
import { describe, expect, it } from "vitest";
import { renderQuadrantLine, renderQuadrantFold } from "../quadrantLine";
import type { ReadDrawLead, ReadDrawQuadrant } from "../readDraw";

const lead = (quadrant: ReadDrawQuadrant, name: string, ratio: number): ReadDrawLead => ({
  card: { playerId: "p", name, wasHeld: true, actualFp: ratio * 30, projectedFp: 30, ownership: 0.3 },
  label: { playerId: "p", name, read: quadrant.startsWith("contrarian") ? "contrarian" : "chalk", draw: quadrant.endsWith("cold") ? "cold" : quadrant.endsWith("warm") ? "warm" : "neutral", quadrant },
  ratio,
});

describe("renderQuadrantLine — the four extreme corners", () => {
  it("contrarian-warm opens on the EVENT (not 'You held') + a clean multiple (double)", () => {
    // De-echo: the lead no longer re-announces ownership — the atom owns "You held X".
    expect(renderQuadrantLine(lead("contrarian-warm", "Nash", 2.0)))
      .toBe("Nash gave you double his average — that's the whole game.");
  });
  it("contrarian-cold opens on the EVENT + a clean fraction (a third) + a dare closer", () => {
    expect(renderQuadrantLine(lead("contrarian-cold", "Nash", 0.33)))
      .toBe("Nash no-showed — a third of his number. Your turn — better dice?");
  });
  it("a name ending in a period (Jr./Sr.) never double-periods", () => {
    // Two mechanisms: chalk leads keep endDot ("… Jr." not "… Jr.."); the contrarian
    // leads now open ON the name (space + verb follows), so no punctuation collides.
    expect(renderQuadrantLine(lead("contrarian-warm", "Jaren Jackson Jr.", 2.0)))
      .toBe("Jaren Jackson Jr. gave you double his average — that's the whole game.");
    expect(renderQuadrantLine(lead("chalk-cold", "Kelly Oubre Jr.", 0.3)))
      .toBe("Everybody held Kelly Oubre Jr. Nobody got paid.");
  });
  it("chalk-warm is the quiet 'you and the room both rode him'", () => {
    expect(renderQuadrantLine(lead("chalk-warm", "Jokic", 1.8)))
      .toBe("You and the room both rode Jokic. He delivered.");
  });
  it("chalk-cold is the quiet 'everybody held him, nobody got paid'", () => {
    expect(renderQuadrantLine(lead("chalk-cold", "Jokic", 0.3)))
      .toBe("Everybody held Jokic. Nobody got paid.");
  });
});

describe("renderQuadrantFold — the convergent single-sentence fold", () => {
  // ownership 0.3 → fade 70%; actualFp = ratio * 30.
  it("contrarian-warm folds fade% + RAW fp + the multiple into one sentence", () => {
    expect(renderQuadrantFold(lead("contrarian-warm", "Giddey", 2.0)))
      .toBe("You held Giddey — 70% of the room off him — and he went double his average (60.0 FP). That's the whole game.");
  });
  it("contrarian-cold folds fade% + RAW fp + the fraction, ending on the dare closer", () => {
    expect(renderQuadrantFold(lead("contrarian-cold", "Wallace", 0.33)))
      .toBe("You held Wallace — 70% of the room off him — and he no-showed, a third of his number (9.9 FP). Your turn — better dice?");
  });
  it("chalk quadrants do not fold (null → composed fallback)", () => {
    expect(renderQuadrantFold(lead("chalk-warm", "Jokic", 1.8))).toBeNull();
    expect(renderQuadrantFold(lead("chalk-cold", "Jokic", 0.3))).toBeNull();
  });
  it("anti-drift: the contrarian-cold lead closer and fold closer are the SAME string", () => {
    const closer = "Your turn — better dice?";
    expect(renderQuadrantLine(lead("contrarian-cold", "X", 0.33)).endsWith(closer)).toBe(true);
    expect(renderQuadrantFold(lead("contrarian-cold", "X", 0.33))!.endsWith(closer)).toBe(true);
  });
});

describe("renderQuadrantLine — human phrasing, never raw decimals", () => {
  const line = (q: ReadDrawQuadrant, r: number) => renderQuadrantLine(lead(q, "X", r));
  it("multiples: 1.6→one and a half, 2.0→double, 2.5→two and a half, 3.0→triple", () => {
    expect(line("contrarian-warm", 1.6)).toContain("one and a half times");
    expect(line("contrarian-warm", 2.0)).toContain("double");
    expect(line("contrarian-warm", 2.5)).toContain("two and a half times");
    expect(line("contrarian-warm", 3.0)).toContain("triple");
  });
  it("fractions: 0.20→a fifth, 0.25→a quarter, 0.33→a third, 0.40→a third", () => {
    expect(line("contrarian-cold", 0.20)).toContain("a fifth");
    expect(line("contrarian-cold", 0.25)).toContain("a quarter");
    expect(line("contrarian-cold", 0.33)).toContain("a third");
    expect(line("contrarian-cold", 0.40)).toContain("a third");
  });
  it("no line contains a raw decimal ratio", () => {
    for (const q of ["contrarian-warm", "contrarian-cold"] as ReadDrawQuadrant[]) {
      for (const r of [1.6, 2.0, 2.5, 3.1, 0.1, 0.22, 0.29, 0.4]) {
        expect(line(q, r)).not.toMatch(/\d\.\d/);
      }
    }
  });
  it("ungraded: never says correct / optimal / best play / should have", () => {
    // guard the graded vocabulary we explicitly forbid — the lines describe the
    // read (fade) and the draw (luck), never evaluate the pick as right/wrong.
    for (const q of ["contrarian-warm", "chalk-warm", "chalk-cold"] as ReadDrawQuadrant[]) {
      expect(renderQuadrantLine(lead(q, "X", q.endsWith("cold") ? 0.3 : 2))).not.toMatch(/optimal|correct|best play|should have/i);
    }
  });
});

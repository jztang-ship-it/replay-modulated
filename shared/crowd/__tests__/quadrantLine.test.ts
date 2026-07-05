// shared/crowd/__tests__/quadrantLine.test.ts — descriptive quadrant copy.
// Renders one line per draw-extreme held card; ungraded (no correct/optimal).
import { describe, expect, it } from "vitest";
import { renderQuadrantLine } from "../quadrantLine";
import type { ReadDrawLead, ReadDrawQuadrant } from "../readDraw";

const lead = (quadrant: ReadDrawQuadrant, name: string, ratio: number): ReadDrawLead => ({
  card: { playerId: "p", name, wasHeld: true, actualFp: ratio * 30, projectedFp: 30, ownership: 0.3 },
  label: { playerId: "p", name, read: quadrant.startsWith("contrarian") ? "contrarian" : "chalk", draw: quadrant.endsWith("cold") ? "cold" : quadrant.endsWith("warm") ? "warm" : "neutral", quadrant },
  ratio,
});

describe("renderQuadrantLine — the four extreme corners", () => {
  it("contrarian-warm names the player + a clean multiple (double)", () => {
    expect(renderQuadrantLine(lead("contrarian-warm", "Nash", 2.0)))
      .toBe("You held Nash. He gave you double his average — that's the whole game.");
  });
  it("contrarian-cold names the player + a clean fraction (a third) + a dare closer", () => {
    expect(renderQuadrantLine(lead("contrarian-cold", "Nash", 0.33)))
      .toBe("You held Nash. He no-showed — a third of his number. Your turn — better dice?");
  });
  it("a name ending in a period (Jr.) does not double the sentence dot", () => {
    // endDot: "You held … Jr." not "… Jr..". Applies to every lead template.
    expect(renderQuadrantLine(lead("contrarian-warm", "Jaren Jackson Jr.", 2.0)))
      .toBe("You held Jaren Jackson Jr. He gave you double his average — that's the whole game.");
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

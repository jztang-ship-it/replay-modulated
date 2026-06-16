// RD7.2 Phase 2 / tuning r1-r2 — Resolution Engine invariant tests.
import { describe, it, expect } from "vitest";
import { classify, explainResolution, lastName, type YourCardFact } from "../resolutionEngine";

function card(over: Partial<YourCardFact>): YourCardFact {
  return { name: "Neutral Guy", tier: "BLUE", salary: 30, wasHeld: true, fp: 40, percentile: 50, poolMedian: 40, nickname: null, ...over };
}
const fill = (n: number) => Array.from({ length: n }, (_, i) => card({ name: `N${i} X` }));

describe("selection — contribution + star-protagonist", () => {
  it("cheap modest overperformer never anchors over a higher-scoring star → variance", () => {
    const cards = [
      card({ name: "Nikola Jokić", tier: "RED", salary: 89, fp: 62, percentile: 33, poolMedian: 73 }),
      card({ name: "Jabari Walker", tier: "WHITE", salary: 16, fp: 30, percentile: 91, poolMedian: 12 }),
      ...fill(4),
    ];
    const c = classify({ yourCards: cards, margin: 11.6 });
    expect(c.register).toBe("variance");
    if (c.decisive) expect(c.decisive.name).not.toBe("Jabari Walker");
  });

  it("held STAR caught fire → A1 + nickname tail", () => {
    const cards = [card({ name: "Nikola Jokić", tier: "RED", salary: 89, wasHeld: true, fp: 113, percentile: 95, poolMedian: 73, nickname: "the Joker" }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: 35 });
    expect(classification.leaf).toBe("A1");
    expect(text).toContain("Jokić");           // lastName form
    expect(text).not.toContain("Nikola Jokić"); // no redundant double-name
    expect(text).toContain("113");
    expect(text).toContain("Classic the Joker");
  });

  it("held NON-star fire is not a decision → variance (no name)", () => {
    const cards = [card({ name: "Cheap Guy", tier: "WHITE", salary: 14, wasHeld: true, fp: 55, percentile: 98, poolMedian: 18 }), ...fill(5)];
    expect(classify({ yourCards: cards, margin: 20 }).register).toBe("variance");
  });

  it("redraw value hero (NON-star) IS named (A3), no nickname", () => {
    const cards = [card({ name: "Value Pick", tier: "BLUE", salary: 30, wasHeld: false, fp: 60, percentile: 96, poolMedian: 22 }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: 25 });
    expect(classification.leaf).toBe("A3");
    expect(text).toContain("Pick");          // named
    expect(text).not.toContain("Classic");   // non-star → no culture tail
  });
});

describe("LOSS naming requires a CLOSE loss + a STAR", () => {
  it("close loss, held STAR bust → A2", () => {
    const cards = [card({ name: "Devin Booker", tier: "ORANGE", salary: 62, wasHeld: true, fp: 14, percentile: 6, poolMedian: 50, nickname: "Book" }), ...fill(5)];
    expect(classify({ yourCards: cards, margin: -12 }).leaf).toBe("A2");
  });

  it("BLOWOUT loss with a busted star → variance/beatdown, NOT named", () => {
    const cards = [card({ name: "Trae Young", tier: "ORANGE", salary: 63, wasHeld: true, fp: 10, percentile: 4, poolMedian: 50, nickname: "Ice Trae" }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: -46 });
    expect(classification.register).toBe("variance");
    expect(text).not.toContain("Trae");
    expect(text.toLowerCase()).toMatch(/beatdown|ran hot|whole board|overwhelmed/);
  });

  it("close loss, NON-star bust → variance (non-star never blamed)", () => {
    const cards = [card({ name: "Cody Martin", tier: "WHITE", salary: 17, wasHeld: true, fp: 5, percentile: 4, poolMedian: 22 }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: -12 });
    expect(classification.register).toBe("variance");
    expect(text).not.toContain("Cody");
  });

  it("close loss, STAR carried most of the scoring → A5 'wasn't enough'", () => {
    const cards = [
      card({ name: "Luka Dončić", tier: "RED", salary: 85, wasHeld: true, fp: 70, percentile: 70, poolMedian: 60 }),
      ...Array.from({ length: 5 }, (_, i) => card({ name: `Low${i} Z`, fp: 12, percentile: 40, poolMedian: 15 })),
    ];
    const { text, classification } = explainResolution({ yourCards: cards, margin: -8 });
    expect(classification.leaf).toBe("A5");
    expect(text.toLowerCase()).toMatch(/wasn't enough|fell short|rest of the slate didn't|couldn't keep up/);
  });
});

describe("FRAMING polarity (hard) — guard over constructed agency hands", () => {
  const LOSS_WORDS = [/that's the loss/i, /sank/i, /cost you/i, /came up empty/i, /flopped/i, /wasn't enough/i, /fell short/i, /couldn't keep up/i, /gamble/i];
  const WIN_WORDS = [/won it/i, /the win/i, /great call/i, /ran them off/i, /demolition/i, /buried/i];
  const scenarios: Array<{ margin: number; yourCards: YourCardFact[] }> = [
    { margin: 35, yourCards: [card({ name: "A Star", tier: "RED", salary: 80, wasHeld: true, fp: 110, percentile: 95, poolMedian: 60 }), ...fill(5)] }, // A1 win
    { margin: 28, yourCards: [card({ name: "B Star", tier: "ORANGE", salary: 60, wasHeld: false, fp: 80, percentile: 92, poolMedian: 45 }), ...fill(5)] }, // A3 win
    { margin: -12, yourCards: [card({ name: "C Star", tier: "ORANGE", salary: 62, wasHeld: true, fp: 12, percentile: 5, poolMedian: 50 }), ...fill(5)] }, // A2 loss
    { margin: -11, yourCards: [card({ name: "D Star", tier: "ORANGE", salary: 60, wasHeld: false, fp: 10, percentile: 5, poolMedian: 48 }), ...fill(5)] }, // A4 loss
    { margin: -8, yourCards: [card({ name: "E Star", tier: "RED", salary: 85, wasHeld: true, fp: 70, percentile: 70, poolMedian: 60 }), ...Array.from({ length: 5 }, (_, i) => card({ name: `L${i} Q`, fp: 12, percentile: 40, poolMedian: 15 }))] }, // A5 loss
  ];
  it("no WIN line contains a loss word; no LOSS line contains a win word", () => {
    for (const s of scenarios) {
      const { text, classification } = explainResolution(s);
      if (classification.register !== "agency") continue;
      const words = classification.outcome === "win" ? LOSS_WORDS : WIN_WORDS;
      for (const w of words) expect(text, `[${classification.outcome} ${classification.leaf}] "${text}"`).not.toMatch(w);
    }
  });
});

describe("variance voice variety", () => {
  it("beatdown losses across margins yield ≥2 distinct phrasings", () => {
    const lines = new Set<string>();
    for (const mg of [-30, -42, -55, -68, -81]) lines.add(explainResolution({ yourCards: fill(6), margin: mg }).text);
    expect(lines.size).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l.toLowerCase()).not.toContain("no single decision swung"); // not coin-flip voice
  });
  it("blowout wins across margins yield ≥2 distinct phrasings", () => {
    const lines = new Set<string>();
    for (const mg of [30, 42, 55, 68, 81]) lines.add(explainResolution({ yourCards: fill(6), margin: mg }).text);
    expect(lines.size).toBeGreaterThanOrEqual(2);
  });
});

describe("bad-beat 3 gates (unchanged) — luck line names NO opponent card (RD8)", () => {
  const good = { name: "Stephen Curry", percentile: 96, actualFp: 55, swing: 30 };
  it("close + well-played + monster → fires, but variance is a property of the SLATE, not a card", () => {
    const { text, classification } = explainResolution({ yourCards: fill(6), margin: -9, opponentOutlier: good });
    expect(classification.mikeBadBeat).toBe(true);
    // RD8 luck-line retirement: no opponent card is ever named in a variance line.
    expect(text).not.toContain("Curry");
    expect(text).not.toContain("Stephen");
    expect(text).not.toMatch(/pull|caught fire|went off|exploded/i);
    expect(text).toMatch(/slate|board|coin-flip|math/i);
  });
  it("blowout never bad-beats", () => { expect(classify({ yourCards: fill(6), margin: -85, opponentOutlier: good }).mikeBadBeat).toBe(false); });
  it("scrub outlier (low FP) → no bad-beat", () => { expect(classify({ yourCards: fill(6), margin: -9, opponentOutlier: { name: "Scrub", percentile: 99, actualFp: 20, swing: 8 } }).mikeBadBeat).toBe(false); });
  it("WIN never bad-beats", () => { expect(classify({ yourCards: fill(6), margin: 9, opponentOutlier: good }).mikeBadBeat).toBe(false); });
});

describe("lastName", () => {
  it("strips suffixes and keeps the surname", () => {
    expect(lastName("Nikola Jokić")).toBe("Jokić");
    expect(lastName("Wendell Moore Jr.")).toBe("Moore");
    expect(lastName("Jaren Jackson II")).toBe("Jackson");
  });
});

// ── RD7.11 — box-line Flavor (DESCRIPTION only, never causation) ─────────────
describe("RD7.11 Flavor — box-line substance", () => {
  // The forbidden-causation blocklist (D5). Flavor describes; it must NEVER
  // imply the user read/called the outcome or that a card "came through". The
  // deterministic templates make this provable across a full sweep.
  // The forbidden sense is per-card FALSE-OWNERSHIP (implying the pick was a
  // read / the player "came through for you"). NOTE: the bare team idiom "your
  // whole board showed up" (pre-existing RD7.2 blowout-win line) is DESCRIPTIVE,
  // not agency — so the guard targets the agency-completion form ("showed up
  // when…"), not bare "showed up".
  const FORBIDDEN = [
    /came through/i, /delivered/i, /showed up when/i, /when it mattered/i,
    /when you needed/i, /rose to/i, /answered the call/i, /\bclutch\b/i,
    /stepped up/i, /for you when/i,
  ];
  const assertClean = (text: string, label: string) => {
    for (const f of FORBIDDEN) expect(text, `[${label}] "${text}"`).not.toMatch(f);
    // No malformed box line (half-triple / phantom stat).
    expect(text, `[${label}] "${text}"`).not.toMatch(/undefined|NaN|-{2,}|\bnull\b/);
  };

  it("A1 win renders the REAL box line, not the bland FP scalar", () => {
    const cards = [card({ name: "Nikola Jokić", tier: "RED", salary: 89, wasHeld: true, fp: 113, percentile: 95, poolMedian: 73, nickname: "the Joker", statLine: { pts: 41, reb: 12, ast: 9, min: 39 } }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: 35 });
    expect(classification.leaf).toBe("A1");
    expect(text).toContain("41-12-9");           // box line present
    expect(text).not.toContain("113");           // FP scalar replaced
    expect(text).toContain("Classic the Joker"); // cultural tag still WRAPPER (after Flavor)
    assertClean(text, "A1 box");
  });

  it("ADVERSARIAL: a monster star line stays DESCRIPTIVE — no agency phrasing", () => {
    // A held star with a huge line. Flavor describes it; it must not slip into
    // "delivered / came through / when it mattered" — that's agency the engine
    // never classified beyond the existing humble Cause clause.
    const cards = [card({ name: "Allen Iverson", tier: "RED", salary: 90, wasHeld: true, fp: 120, percentile: 99, poolMedian: 55, nickname: "AI", statLine: { pts: 51, reb: 7, ast: 8, stl: 6, min: 44 } }), ...fill(5)];
    const { text } = explainResolution({ yourCards: cards, margin: 40 });
    expect(text).toMatch(/51-7-8/);
    assertClean(text, "A1 monster");
  });

  it("sparse/missing statLine → degrades to the FP line, no error, no half-line", () => {
    const cards = [card({ name: "Nikola Jokić", tier: "RED", salary: 89, wasHeld: true, fp: 113, percentile: 95, poolMedian: 73, nickname: "the Joker", statLine: null }), ...fill(5)];
    const { text } = explainResolution({ yourCards: cards, margin: 35 });
    expect(text).toContain("113");                // FP fallback = today's line
    assertClean(text, "A1 sparse");
    // A statLine with no scoring key (e.g. a non-basketball shape) also degrades.
    const cards2 = [card({ name: "Some One", tier: "RED", salary: 89, wasHeld: true, fp: 90, percentile: 95, poolMedian: 60, statLine: { hits: 3, ab: 4 } }), ...fill(5)];
    const out2 = explainResolution({ yourCards: cards2, margin: 30 });
    expect(out2.text).toContain("90");
    assertClean(out2.text, "A1 non-bball shape");
  });

  it("held-LOST (A2) bust renders its (low) box line descriptively", () => {
    const cards = [card({ name: "Devin Booker", tier: "ORANGE", salary: 62, wasHeld: true, fp: 14, percentile: 6, poolMedian: 50, nickname: "Book", statLine: { pts: 8, reb: 2, ast: 1, min: 28 } }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: -12 });
    expect(classification.leaf).toBe("A2");
    expect(text).toContain("8-2-1");
    assertClean(text, "A2 bust");
  });

  it("variance-default hand → box-line COLOR without manufacturing a cause", () => {
    // No agency: a held non-star fire is variance. Flavor may rank the top
    // scorer descriptively, but the register stays variance and no cause/agency
    // phrasing appears.
    const cards = [card({ name: "Kevin Garnett", tier: "BLUE", salary: 30, wasHeld: true, fp: 70, percentile: 90, poolMedian: 35, statLine: { pts: 30, reb: 14, ast: 4, min: 38 } }), ...fill(5)];
    const { text, classification } = explainResolution({ yourCards: cards, margin: 14 });
    expect(classification.register).toBe("variance");
    // RD7.12-c: the closer is now diversified (card-naming OR margin/slate shape).
    // Assert a descriptive closer was added (box stat or a margin/team phrase),
    // still honest (no agency).
    expect(text.toLowerCase()).toMatch(/30-14-4|box score|stood out|on balance|spread across|team effort/);
    assertClean(text, "variance color");
  });

  it("HONESTY SWEEP: no generated line ever crosses description→causation", () => {
    const tiers = ["RED", "ORANGE", "BLUE", "WHITE"];
    const lines: Array<{ pts: number; reb: number; ast: number }> = [
      { pts: 51, reb: 7, ast: 8 }, { pts: 9, reb: 2, ast: 1 }, { pts: 33, reb: 11, ast: 12 }, { pts: 24, reb: 5, ast: 5 },
    ];
    let n = 0;
    for (const margin of [-46, -12, -8, -2, 0, 3, 14, 35, 60]) {
      for (const tier of tiers) {
        for (const held of [true, false]) {
          for (const sl of lines) {
            const cards = [card({ name: "Test Player", tier, salary: 80, wasHeld: held, fp: sl.pts * 2, percentile: 88, poolMedian: 40, nickname: "TP", statLine: { ...sl, stl: 6, blk: 5, threes: 8 } }), ...fill(5)];
            const { text } = explainResolution({ yourCards: cards, margin });
            assertClean(text, `sweep m=${margin} ${tier} held=${held} ${sl.pts}`);
            expect(text.length).toBeLessThanOrEqual(200); // MAX_CHARS (D6)
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(200); // confirm the sweep actually ran broadly
  });
});

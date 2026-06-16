// RD8 — Rivalry Divergence primitive tests (v2: result-congruent selection).
// Spec: docs/rivalry-divergence-spec.md (§0 score-only-to-rank + attribution
// corollary, §2 struct, §3 validator, §5 valence, §6 derivation).
import { describe, it, expect } from "vitest";
import {
  selectDivergence,
  renderDivergenceClause,
  validateRivalryClause,
  type Divergence,
  type ResultContext,
} from "../selectDivergence";
import type { GeneratedCard } from "@shared/types/index";

let seq = 0;
function gc(over: Partial<GeneratedCard>): GeneratedCard {
  const n = seq++;
  return {
    id: `id${n}`, basePlayerId: `bp${n}`, personKey: `pk${n}`, cardId: `cid${n}`,
    name: `Player ${n}`, team: "TEAM", season: "2023", position: "G",
    projectedFp: 30, salary: 30, tier: "BLUE", slotIndex: 0, wasHeld: false,
    actualFp: 20, fpDelta: 0, gameInfo: { date: "", opponent: "" }, statLine: {},
    achievements: [], ...over,
  };
}

// decisions[i] = [senderHeld, receiverHeld]; dealt[i].fp = the dealt player's score.
function makeHand(
  dealt: Array<{ bp: string; name: string; fp: number }>,
  decisions: Array<[boolean, boolean]>,
) {
  const initialRoster = dealt.map((d, i) =>
    gc({ basePlayerId: d.bp, name: d.name, slotIndex: i, actualFp: d.fp }));
  const senderResolved = dealt.map((d, i) =>
    decisions[i][0]
      ? gc({ basePlayerId: d.bp, name: d.name, slotIndex: i, actualFp: d.fp, wasHeld: true })
      : gc({ basePlayerId: `srepl${i}`, name: `S Repl ${i}`, slotIndex: i, actualFp: 15, wasHeld: false }));
  const myRoster = dealt.map((d, i) =>
    decisions[i][1]
      ? gc({ basePlayerId: d.bp, name: d.name, slotIndex: i, actualFp: d.fp, wasHeld: true })
      : gc({ basePlayerId: `rrepl${i}`, name: `R Repl ${i}`, slotIndex: i, actualFp: 15, wasHeld: false }));
  return { initialRoster, senderResolved, myRoster };
}
const WIN: ResultContext = { outcome: "win", decisiveLineFound: true };
const LOSS: ResultContext = { outcome: "loss", decisiveLineFound: true };

describe("result-congruent selection (§5)", () => {
  it("WIN surfaces YOUR hold / THEIR fade — even over a higher-salience reverse divergence", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "yourcall", name: "Your Call", fp: 30 }, // you held, Mike faded (win-congruent)
        { bp: "theircall", name: "Their Call", fp: 90 }, // Mike held, you faded (loss-congruent, bigger)
      ],
      [[false, true], [true, false]],
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster, WIN)!;
    expect(d.playerId).toBe("yourcall");
    expect(d.receiverDecision).toBe("hold");
    expect(d.senderDecision).toBe("fade");
  });

  it("LOSS surfaces THEIR hold / YOUR fade — the call that beat you", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "theircall", name: "Their Call", fp: 50 }, // Mike held, you faded (loss-congruent)
        { bp: "yourcall", name: "Your Call", fp: 90 }, // you held, Mike faded (win-congruent, bigger)
      ],
      [[true, false], [false, true]],
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster, LOSS)!;
    expect(d.playerId).toBe("theircall");
    expect(d.senderDecision).toBe("hold");
    expect(d.receiverDecision).toBe("fade");
  });

  it("no result-congruent divergence → null (WIN with only loss-congruent divergences)", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "theircall", name: "Their Call", fp: 50 }, { bp: "agree", name: "Agree", fp: 20 }],
      [[true, false], [true, true]],
    );
    expect(selectDivergence(initialRoster, senderResolved, myRoster, WIN)).toBeNull();
  });

  it("image-3 fix: balanced WIN (base found NO decisive line) → null even with a congruent divergence", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "yourcall", name: "Your Call", fp: 40 }, { bp: "agree", name: "Agree", fp: 20 }],
      [[false, true], [true, true]],
    );
    const balancedWin: ResultContext = { outcome: "win", decisiveLineFound: false };
    expect(selectDivergence(initialRoster, senderResolved, myRoster, balancedWin)).toBeNull();
  });

  it("LOSS with no decisive line (base says luck/variance) → null (attribution corollary)", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "theircall", name: "Their Call", fp: 50 }, { bp: "agree", name: "Agree", fp: 20 }],
      [[true, false], [true, true]],
    );
    expect(selectDivergence(initialRoster, senderResolved, myRoster, { outcome: "loss", decisiveLineFound: false })).toBeNull();
  });

  it("TIE picks the sharper side, either direction (no decisive-line gate)", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "yourcall", name: "Your Call", fp: 60 }, // win-congruent, bigger
        { bp: "theircall", name: "Their Call", fp: 20 }, // loss-congruent
      ],
      [[false, true], [true, false]],
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster, { outcome: "tie", decisiveLineFound: false })!;
    expect(d.playerId).toBe("yourcall");
  });

  it("TIE below the salience floor → null", () => {
    // disputed player scored a sliver of the holding hand → not consequential.
    // slot0 (Tiny) diverges; slot1 (Agree, big score) is held by BOTH → agreement.
    const initialRoster = [gc({ basePlayerId: "tiny", name: "Tiny", slotIndex: 0, actualFp: 2 }), gc({ basePlayerId: "agree", name: "Agree", slotIndex: 1, actualFp: 200 })];
    const senderResolved = [gc({ basePlayerId: "srepl", name: "S Repl", slotIndex: 0, wasHeld: false, actualFp: 15 }), gc({ basePlayerId: "agree", name: "Agree", slotIndex: 1, wasHeld: true, actualFp: 200 })];
    const myRoster = [gc({ basePlayerId: "tiny", name: "Tiny", slotIndex: 0, wasHeld: true, actualFp: 2 }), gc({ basePlayerId: "agree", name: "Agree", slotIndex: 1, wasHeld: true, actualFp: 200 })];
    expect(selectDivergence(initialRoster, senderResolved, myRoster, { outcome: "tie", decisiveLineFound: false })).toBeNull();
  });
});

describe("derivation + invariants carried from v1 (§6, §2)", () => {
  it("membership keys on basePlayerId, not array position", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "p0", name: "P0", fp: 20 }, { bp: "giannis", name: "Giannis A", fp: 60 }],
      [[true, true], [true, false]],
    );
    senderResolved[1] = gc({ basePlayerId: "x", name: "X", slotIndex: 1, wasHeld: false });
    senderResolved.unshift(gc({ basePlayerId: "giannis", name: "Giannis A", slotIndex: 1, actualFp: 60, wasHeld: true }));
    const d = selectDivergence(initialRoster, senderResolved, myRoster, LOSS)!;
    expect(d.playerId).toBe("giannis");
    expect(d.slotIndex).toBe(1);
  });

  it("legacy all-false snapshot → null", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "a", name: "A", fp: 20 }, { bp: "b", name: "B", fp: 20 }], [[false, false], [false, false]]);
    expect(selectDivergence(initialRoster, senderResolved, myRoster, LOSS)).toBeNull();
  });

  it("empty rosters → null", () => {
    expect(selectDivergence([], [], [], LOSS)).toBeNull();
  });

  it("NO raw score on the returned struct; salience is a bounded 0..1 rank", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "g", name: "Giannis A", fp: 50 }], [[true, false]]);
    const d = selectDivergence(initialRoster, senderResolved, myRoster, LOSS)!;
    expect(Object.keys(d).sort()).toEqual([
      "playerId", "playerName", "receiverDecision", "salience", "senderDecision", "slotIndex"]);
    expect((d as Record<string, unknown>).score).toBeUndefined();
    expect((d as Record<string, unknown>).actualFp).toBeUndefined();
    expect(d.salience).toBeGreaterThan(0);
    expect(d.salience).toBeLessThanOrEqual(1);
    expect(d.salience).not.toBe(50);
  });
});

describe("renderDivergenceClause — disagreement, no causal verb, real name (§4, §9)", () => {
  const causal = /\b(beat|beats|caused|cause|revenge|made him pay|because)\b/i;
  const base = (o: Partial<Divergence>): Divergence => ({
    slotIndex: 0, playerId: "g", playerName: "Giannis A",
    senderDecision: "fade", receiverDecision: "hold", salience: 0.4, ...o });

  it("receiver-held / sender-faded names one player, no causal verb", () => {
    const c = renderDivergenceClause(base({}));
    expect(c).toContain("Giannis A");
    expect(c).not.toMatch(causal);
  });

  it("uses the real opponent name when given", () => {
    const c = renderDivergenceClause(base({ senderDecision: "hold", receiverDecision: "fade" }), { opponentName: "John Tang" });
    expect(c).toContain("John Tang");
    expect(c).not.toContain("Mike");
  });

  it("falls back to Mike when no name", () => {
    expect(renderDivergenceClause(base({ senderDecision: "hold", receiverDecision: "fade" }))).toContain("Mike");
  });

  it("coincident variant omits the player re-naming", () => {
    const c = renderDivergenceClause(base({}), { coincident: true });
    expect(c).not.toContain("Giannis A");
    expect(c.length).toBeGreaterThan(0);
  });
});

describe("validateRivalryClause — one shared-deal identity (§3)", () => {
  function diverged() {
    return makeHand(
      [{ bp: "giannis", name: "Giannis A", fp: 50 }, { bp: "curry", name: "Steph Curry", fp: 40 }],
      [[true, false], [false, true]]);
  }
  it("valid one-identity clause passes", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const d = selectDivergence(initialRoster, senderResolved, myRoster, LOSS)!;
    expect(validateRivalryClause(renderDivergenceClause(d), d, initialRoster, senderResolved, myRoster)).toBe(true);
  });
  it("'one each' loophole — two named identities → invalid", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const d = selectDivergence(initialRoster, senderResolved, myRoster, LOSS)!;
    expect(validateRivalryClause("You held Giannis A. Mike kept Steph Curry.", d, initialRoster, senderResolved, myRoster)).toBe(false);
  });
  it("named player not the shared-deal slot player → invalid", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const forged: Divergence = { slotIndex: 0, playerId: "curry", playerName: "Steph Curry", senderDecision: "hold", receiverDecision: "fade", salience: 0.4 };
    expect(validateRivalryClause(renderDivergenceClause(forged), forged, initialRoster, senderResolved, myRoster)).toBe(false);
  });
  it("slot not present in the deal → invalid", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const d: Divergence = { slotIndex: 99, playerId: "giannis", playerName: "Giannis A", senderDecision: "hold", receiverDecision: "fade", salience: 0.4 };
    expect(validateRivalryClause(renderDivergenceClause(d), d, initialRoster, senderResolved, myRoster)).toBe(false);
  });
});

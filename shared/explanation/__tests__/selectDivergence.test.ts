// RD8 — Rivalry Divergence primitive tests.
// Spec: docs/rivalry-divergence-spec.md (§0 score-only-to-rank, §2 struct,
// §3 validator, §6 derivation). Score must NEVER cross the return boundary.
import { describe, it, expect } from "vitest";
import {
  selectDivergence,
  renderDivergenceClause,
  validateRivalryClause,
  type Divergence,
} from "../selectDivergence";
import type { GeneratedCard } from "@shared/types/index";

let seq = 0;
function gc(over: Partial<GeneratedCard>): GeneratedCard {
  const n = seq++;
  return {
    id: `id${n}`,
    basePlayerId: `bp${n}`,
    personKey: `pk${n}`,
    cardId: `cid${n}`,
    name: `Player ${n}`,
    team: "TEAM",
    season: "2023",
    position: "G",
    projectedFp: 30,
    salary: 30,
    tier: "BLUE",
    slotIndex: 0,
    wasHeld: false,
    actualFp: 20,
    fpDelta: 0,
    gameInfo: { date: "", opponent: "" },
    statLine: {},
    achievements: [],
    ...over,
  };
}

// Build a same-slot deal where, per slot, both sides either hold the dealt
// player, both fade it (each side carries its own replacement at that slot),
// or diverge. `decisions[i] = [senderHeld, receiverHeld]`.
function makeHand(
  dealt: Array<{ bp: string; name: string; fp: number }>,
  decisions: Array<[boolean, boolean]>,
) {
  const initialRoster: GeneratedCard[] = dealt.map((d, i) =>
    gc({ basePlayerId: d.bp, name: d.name, slotIndex: i, actualFp: d.fp, wasHeld: false }),
  );
  const senderResolved: GeneratedCard[] = dealt.map((d, i) => {
    const [sHeld] = decisions[i];
    return sHeld
      ? gc({ basePlayerId: d.bp, name: d.name, slotIndex: i, actualFp: d.fp, wasHeld: true })
      : gc({ basePlayerId: `srepl${i}`, name: `S Repl ${i}`, slotIndex: i, actualFp: 15, wasHeld: false });
  });
  const myRoster: GeneratedCard[] = dealt.map((d, i) => {
    const [, rHeld] = decisions[i];
    return rHeld
      ? gc({ basePlayerId: d.bp, name: d.name, slotIndex: i, actualFp: d.fp, wasHeld: true })
      : gc({ basePlayerId: `rrepl${i}`, name: `R Repl ${i}`, slotIndex: i, actualFp: 15, wasHeld: false });
  });
  return { initialRoster, senderResolved, myRoster };
}

describe("selectDivergence — derivation (§6)", () => {
  it("sender held, receiver faded → divergence (hold/fade), by basePlayerId", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "giannis", name: "Giannis A", fp: 50 },
        { bp: "agree", name: "Agree Guy", fp: 30 },
      ],
      [[true, false], [true, true]], // slot0 diverges; slot1 both hold
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster);
    expect(d).not.toBeNull();
    expect(d!.playerId).toBe("giannis");
    expect(d!.slotIndex).toBe(0);
    expect(d!.senderDecision).toBe("hold");
    expect(d!.receiverDecision).toBe("fade");
  });

  it("sender faded, receiver held → 'Mike cut him' = dealt id absent from sender held-set", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "curry", name: "Steph Curry", fp: 40 },
        { bp: "agree", name: "Agree Guy", fp: 30 },
      ],
      [[false, true], [false, false]], // slot0 diverges; slot1 both fade
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster);
    expect(d!.playerId).toBe("curry");
    expect(d!.senderDecision).toBe("fade");
    expect(d!.receiverDecision).toBe("hold");
  });

  it("membership keys on basePlayerId, not array position (shuffled resolved order)", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "p0", name: "P0", fp: 20 },
        { bp: "giannis", name: "Giannis A", fp: 60 },
      ],
      [[true, false], [true, true]], // slot0 both hold, slot1 ... overwrite below
    );
    // Force slot1 to diverge (sender holds giannis, receiver fades) but place
    // the sender's giannis card at array index 0 to prove position-independence.
    senderResolved[1] = gc({ basePlayerId: "srepl1", name: "S Repl 1", slotIndex: 1, wasHeld: false });
    senderResolved.unshift(gc({ basePlayerId: "giannis", name: "Giannis A", slotIndex: 1, actualFp: 60, wasHeld: true }));
    myRoster[1] = gc({ basePlayerId: "rrepl1", name: "R Repl 1", slotIndex: 1, wasHeld: false });
    const d = selectDivergence(initialRoster, senderResolved, myRoster);
    expect(d!.playerId).toBe("giannis");
    expect(d!.slotIndex).toBe(1);
  });

  it("legacy all-false snapshot (no holds either side) → null", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "a", name: "A", fp: 20 },
        { bp: "b", name: "B", fp: 20 },
      ],
      [[false, false], [false, false]],
    );
    expect(selectDivergence(initialRoster, senderResolved, myRoster)).toBeNull();
  });

  it("identical decisions every slot → null (nothing diverged)", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "a", name: "A", fp: 20 },
        { bp: "b", name: "B", fp: 20 },
      ],
      [[true, true], [false, false]],
    );
    expect(selectDivergence(initialRoster, senderResolved, myRoster)).toBeNull();
  });

  it("empty rosters → null (defensive)", () => {
    expect(selectDivergence([], [], [])).toBeNull();
  });
});

describe("selectDivergence — salience (§0: score ranks, never frames)", () => {
  it("returns the higher-consequence disagreement (bigger disputed score wins)", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "small", name: "Small Score", fp: 8 },
        { bp: "big", name: "Big Score", fp: 80 },
      ],
      [[true, false], [true, false]], // both slots diverge; slot1 disputed player scored more
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster);
    expect(d!.playerId).toBe("big");
  });

  it("NO raw score on the returned struct; salience is a bounded 0..1 rank", () => {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [{ bp: "giannis", name: "Giannis A", fp: 50 }],
      [[true, false]],
    );
    const d = selectDivergence(initialRoster, senderResolved, myRoster)!;
    const keys = Object.keys(d).sort();
    expect(keys).toEqual([
      "playerId",
      "playerName",
      "receiverDecision",
      "salience",
      "senderDecision",
      "slotIndex",
    ]);
    // No field carries a raw renderable score.
    expect((d as Record<string, unknown>).score).toBeUndefined();
    expect((d as Record<string, unknown>).fp).toBeUndefined();
    expect((d as Record<string, unknown>).actualFp).toBeUndefined();
    // salience is a normalized rank, not the player's point total.
    expect(d.salience).toBeGreaterThan(0);
    expect(d.salience).toBeLessThanOrEqual(1);
    expect(d.salience).not.toBe(50);
  });
});

describe("renderDivergenceClause — states the disagreement, no causal verb (§4)", () => {
  const causal = /\b(beat|beats|caused|cause|revenge|made him pay|because)\b/i;

  it("receiver held / sender faded → names one player, no causal verb", () => {
    const d: Divergence = {
      slotIndex: 0, playerId: "giannis", playerName: "Giannis A",
      senderDecision: "fade", receiverDecision: "hold", salience: 0.4,
    };
    const clause = renderDivergenceClause(d);
    expect(clause).toContain("Giannis");
    expect(clause).not.toMatch(causal);
  });

  it("sender held / receiver faded → names one player, no causal verb", () => {
    const d: Divergence = {
      slotIndex: 1, playerId: "curry", playerName: "Steph Curry",
      senderDecision: "hold", receiverDecision: "fade", salience: 0.5,
    };
    const clause = renderDivergenceClause(d);
    expect(clause).toContain("Curry");
    expect(clause).not.toMatch(causal);
  });

  it("coincident variant omits the player re-naming (base already named him)", () => {
    const d: Divergence = {
      slotIndex: 0, playerId: "giannis", playerName: "Giannis A",
      senderDecision: "fade", receiverDecision: "hold", salience: 0.4,
    };
    const clause = renderDivergenceClause(d, { coincident: true });
    expect(clause).not.toContain("Giannis");      // pronoun form
    expect(clause).not.toMatch(causal);
    expect(clause.length).toBeGreaterThan(0);
  });
});

describe("validateRivalryClause — one shared-deal identity (§3)", () => {
  function diverged() {
    const { initialRoster, senderResolved, myRoster } = makeHand(
      [
        { bp: "giannis", name: "Giannis A", fp: 50 },
        { bp: "curry", name: "Steph Curry", fp: 40 },
      ],
      [[true, false], [false, true]],
    );
    return { initialRoster, senderResolved, myRoster };
  }

  it("valid one-identity clause passes", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const d = selectDivergence(initialRoster, senderResolved, myRoster)!;
    const clause = renderDivergenceClause(d);
    expect(validateRivalryClause(clause, d, initialRoster, senderResolved, myRoster)).toBe(true);
  });

  it("'one each' loophole — two named identities → invalid", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const d = selectDivergence(initialRoster, senderResolved, myRoster)!;
    const forged = "You held Giannis A. Mike kept Steph Curry.";
    expect(validateRivalryClause(forged, d, initialRoster, senderResolved, myRoster)).toBe(false);
  });

  it("named player not the shared-deal slot player → invalid", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const forged: Divergence = {
      slotIndex: 0, playerId: "curry", playerName: "Steph Curry", // slot0 is giannis
      senderDecision: "hold", receiverDecision: "fade", salience: 0.4,
    };
    const clause = renderDivergenceClause(forged);
    expect(validateRivalryClause(clause, forged, initialRoster, senderResolved, myRoster)).toBe(false);
  });

  it("slot not present in the deal → invalid", () => {
    const { initialRoster, senderResolved, myRoster } = diverged();
    const d: Divergence = {
      slotIndex: 99, playerId: "giannis", playerName: "Giannis A",
      senderDecision: "hold", receiverDecision: "fade", salience: 0.4,
    };
    const clause = renderDivergenceClause(d);
    expect(validateRivalryClause(clause, d, initialRoster, senderResolved, myRoster)).toBe(false);
  });
});

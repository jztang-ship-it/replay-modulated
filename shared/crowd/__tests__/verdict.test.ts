// shared/crowd/__tests__/verdict.test.ts — the verdict renderer, every tone path
// + edge cases, on constructed hands. Config defaults: fadeChalk 0.55 (own ≤ 0.45
// = faded), fpMeaningful 30 (produced), fpBust 12 (busted).
import { describe, expect, it } from "vitest";
import { computeVerdict, type VerdictCard } from "../verdict";

// helpers: own → fade. faded = own ≤ 0.45; chalk = own > 0.45.
const card = (id: string, name: string, wasHeld: boolean, fp: number, ownership: number): VerdictCard => ({ id, name, wasHeld, fp, ownership });
const FADED = 0.30; // fade 70%
const CHALK = 0.62; // fade 38%

describe("verdict — contrarian-hit (a faded hold that went off)", () => {
  const v = computeVerdict({
    cards: [
      card("a", "Alvarado", true, 45, FADED),   // faded + produced → the call
      card("b", "Jokic", true, 25, CHALK),        // chalk, middling
      card("c", "Bench", false, 60, 0.28),        // huge but REROLLED-in → ineligible
    ],
    totalFp: 210, tier: "STARTER",
  });
  it("names the faded player and credits the CALL, not genius", () => {
    expect(v.tone).toBe("contrarian-hit");
    expect(v.player).toBe("Alvarado");
    expect(v.fadePct).toBe(70);
    expect(v.fpDelivered).toBe(45);
    expect(v.line).toBe("You held Alvarado. 70% of the room faded him. He went for 45.");
    // guard #2: no skill/process narration
    expect(v.line).not.toMatch(/genius|great (process|read)|smart|clever/i);
  });
  it("a rerolled-in card can't be the verdict even if it's the biggest/most-faded", () => {
    expect(v.player).not.toBe("Bench");
  });
});

describe("verdict — chalk-hit (the room was WITH you; no fabricated dissent)", () => {
  const v = computeVerdict({
    cards: [
      card("a", "Jokic", true, 58, CHALK),        // chalk blowup — highest fade×FP overall
      card("b", "Faded", true, 28, FADED),         // faded but did NOT clear fpMeaningful (28<30)
    ],
    totalFp: 220, tier: "ALL STAR",
  });
  it("tells the truth: you rode the consensus", () => {
    expect(v.tone).toBe("chalk-hit");
    expect(v.player).toBe("Jokic");
    expect(v.line).toBe("The room was on Jokic too. You just rode him for 58.");
    // guard #1: never claim a fight-the-room angle on chalk
    expect(v.line).not.toMatch(/faded|against the room|bold|nobody/i);
  });
});

describe("verdict — contrarian-miss (a faded hold that busted; not hidden)", () => {
  const v = computeVerdict({
    cards: [
      card("a", "Faded", true, 8, FADED),          // faded + busted → the losing call
      card("b", "Chalk", true, 20, CHALK),          // chalk middling (no chalk-hit: 20<30)
    ],
    totalFp: 175, tier: "ROOKIE",
  });
  it("surfaces the miss honestly even though a chalk card has higher fade×FP", () => {
    expect(v.tone).toBe("contrarian-miss");
    expect(v.player).toBe("Faded");
    expect(v.fpDelivered).toBe(8);
    expect(v.line).toBe("You backed Faded against the room — 70% faded him. He didn't land (8).");
  });
});

describe("verdict — hand-level fallback (no held call cleared meaningful fade OR FP)", () => {
  it("all holds middling → quiet honest hand line, no player", () => {
    const v = computeVerdict({
      cards: [
        card("a", "MidFade", true, 18, FADED),      // faded but middling (12<18<30 → not hit, not bust)
        card("b", "MidChalk", true, 22, CHALK),      // chalk middling
      ],
      totalFp: 176, tier: "STARTER",
    });
    expect(v.tone).toBe("hand-level");
    expect(v.player).toBeUndefined();
    expect(v.fadePct).toBe(0);
    expect(v.line).toBe("You built a 176. A STARTER board.");
  });
  it("a chalk card that busted is NOT a miss (you agreed with the room) → hand-level", () => {
    const v = computeVerdict({ cards: [card("a", "ChalkBust", true, 9, CHALK)], totalFp: 150, tier: "BUST" }, );
    expect(v.tone).toBe("hand-level");
    expect(v.line).toBe("You built a 150. Off night.");
  });
  it("no held cards at all → hand-level (everything rerolled in)", () => {
    const v = computeVerdict({
      cards: [card("a", "R1", false, 50, FADED), card("b", "R2", false, 40, 0.25)],
      totalFp: 190, tier: "ROOKIE",
    });
    expect(v.tone).toBe("hand-level");
    expect(v.player).toBeUndefined();
  });
});

describe("verdict — determinism (same hand always renders the same verdict)", () => {
  it("ties on contrarian-right break by higher FP, then lower ownership", () => {
    // A: fade .60 × fp 35 = 21 ;  B: fade .70 × fp 30 = 21  → tie; higher FP (A) wins
    const hand = {
      cards: [card("A", "AA", true, 35, 0.40), card("B", "BB", true, 30, 0.30)],
      totalFp: 205, tier: "STARTER",
    };
    const v1 = computeVerdict(hand), v2 = computeVerdict(hand);
    expect(v1).toEqual(v2);
    expect(v1.tone).toBe("contrarian-hit");
    expect(v1.player).toBe("AA");
  });
  it("full-tie (same fade×FP and FP) breaks by lower ownership = higher fade", () => {
    const v = computeVerdict({
      cards: [card("A", "AA", true, 30, 0.40), card("B", "BB", true, 30, 0.30)], // both 30 FP; B more faded
      totalFp: 205, tier: "STARTER",
    });
    // fade×FP: A .60×30=18, B .70×30=21 → B wins outright (more faded, same FP)
    expect(v.player).toBe("BB");
  });
});

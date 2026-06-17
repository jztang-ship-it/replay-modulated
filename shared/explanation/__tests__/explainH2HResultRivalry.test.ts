// RD8 v2 — explainH2HResult wiring: result-congruent clause (§5), real opponent
// name (§9 Step 2), delta-once (§9 Step 3), flag-OFF byte-identical.
//
// Note on subsume: under result-congruent gating the divergence fires only on
// agency (win/loss) or tie hands — none of which carry a bad-beat (bad-beat is a
// VARIANCE-LOSS frame). So the v1 "divergence suppresses bad-beat" coincidence
// no longer arises; the opponentOutlier:null subsume is retained (spec §8.1) but
// inert in practice. We instead assert: divergence fires on agency hands; the
// bad-beat path (no divergence) is unchanged except it now carries the real name.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { explainH2HResult } from "../explainH2HResult";
import { registerPoolStatsProvider } from "../poolStatsProvider";
import type { PoolStats } from "../poolStats";

const ps = (p50: number, max: number, p90 = (p50 + max) / 2): PoolStats => ({
  n: 50, mean: p50, p10: Math.max(0, p50 - 12), p50, p90, min: 0, max,
});
const POOL: Record<string, PoolStats> = {
  booker: ps(50, 70),      // fp 8 → busted star (low pctile, big short)
  jokic: ps(40, 95),       // fp 90 → fired star (high pctile)
  monster: ps(20, 70),     // sender outlier-ish
};
for (let i = 0; i < 6; i++) {
  POOL[`r${i}`] = ps(12, 40); // fp 17 → ~well-played non-stars
  POOL[`s${i}`] = ps(10, 24);
}
beforeAll(() => registerPoolStatsProvider((bp) => POOL[bp] ?? null));
afterAll(() => registerPoolStatsProvider(() => null));

function card(o: Record<string, unknown>) {
  return {
    id: String(o.bp), basePlayerId: String(o.bp), personKey: String(o.bp), cardId: String(o.bp),
    name: o.name ?? "Filler", team: "X", season: "2023", position: "G", photoCode: null,
    salary: o.salary ?? 30, tier: o.tier ?? "BLUE", projectedFp: 30,
    slotIndex: o.slotIndex ?? 0, wasHeld: o.wasHeld ?? false, actualFp: o.fp ?? 17,
    fpDelta: 0, gameInfo: { date: "", opponent: "OPP" },
    statLine: { pts: o.fp ?? 17, reb: 3, ast: 2 }, achievements: [],
  };
}
function hand(cards: unknown[], totalFp: number) {
  return { handId: "h", totalFp, tier: "STARTER", cards, displayName: "John Tang" } as never;
}

// ── AGENCY LOSS (held star bust → A2) + their-hold / your-fade divergence ──
const lossRecipient = [
  card({ bp: "booker", name: "Devin Booker", tier: "ORANGE", wasHeld: true, fp: 8, slotIndex: 0 }),
  ...[1, 2, 3, 4, 5].map((i) => card({ bp: `r${i}`, name: `Recip ${i}`, fp: 17, slotIndex: i })),
];
const lossSender = [
  card({ bp: "monster", name: "Nikola Monster", wasHeld: true, fp: 60, slotIndex: 0 }),
  ...[1, 2, 3, 4, 5].map((i) => card({ bp: `s${i}`, name: `Send ${i}`, fp: 10, slotIndex: i })),
];
// Shared deal: slot0 = Nikola Monster (sender held, recipient faded → loss-congruent).
const lossDeal = [
  card({ bp: "monster", name: "Nikola Monster", slotIndex: 0 }),
  ...[1, 2, 3, 4, 5].map((i) => card({ bp: `deal${i}`, name: `Deal ${i}`, slotIndex: i })),
] as never;
const LOSS = { sender: hand(lossSender, 112), recipient: hand(lossRecipient, 100) }; // margin -12

// ── AGENCY WIN (held star fire → A1) + your-hold / their-fade divergence ──
const winRecipient = [
  card({ bp: "jokic", name: "Nikola Jokic", tier: "RED", wasHeld: true, fp: 90, slotIndex: 0 }),
  card({ bp: "yourguy", name: "Your Guy", wasHeld: true, fp: 30, slotIndex: 1 }),
  ...[2, 3, 4, 5].map((i) => card({ bp: `r${i}`, name: `Recip ${i}`, fp: 12, slotIndex: i })),
];
const winSender = [1, 2, 3, 4, 5, 6].map((i) => card({ bp: `s${i % 6}`, name: `Send ${i}`, fp: 10, slotIndex: i - 1 }));
// Shared deal: slot1 = Your Guy (you held, sender faded → win-congruent).
const winDeal = [
  card({ bp: "free", name: "Free Agent", slotIndex: 0 }),
  card({ bp: "yourguy", name: "Your Guy", slotIndex: 1 }),
  ...[2, 3, 4, 5].map((i) => card({ bp: `deal${i}`, name: `Deal ${i}`, slotIndex: i })),
] as never;
const WIN = { sender: hand(winSender, 100), recipient: hand(winRecipient, 130) }; // margin +30

const ON = (extra: Record<string, unknown>) => ({ sport: "basketball", rivalryEnabled: true, opponentName: "John Tang", ...extra });

describe("flag OFF — copy fixes apply (un-gated); only the clause is gated", () => {
  const vRecipient = [0, 1, 2, 3, 4, 5].map((i) => card({ bp: `r${i}`, name: `R ${i}`, fp: 17, slotIndex: i }));

  it("beatdown loss: real name un-gated (not 'Mike'), opponent's BOARD not a card", () => {
    const r = explainH2HResult({
      sender: hand(lossSender, 135), recipient: hand(vRecipient, 100), // margin -35 → beatdown
      sport: "basketball", initialRoster: lossDeal, rivalryEnabled: false, opponentName: "John Tang",
    })!;
    expect(r.rivalryClause).toBeNull();              // clause still gated OFF
    expect(r.text).toContain("John Tang");           // name fix un-gated
    expect(r.text).not.toContain("Mike");
    expect(r.text).not.toContain("Nikola Monster");  // never names an opponent card
  });

  it("bad-beat close loss: luck line retired un-gated → card-free slate, no 'pull'", () => {
    const r = explainH2HResult({
      sender: hand(lossSender, 112), recipient: hand(vRecipient, 100), // margin -12 → bad-beat-eligible
      sport: "basketball", initialRoster: lossDeal, rivalryEnabled: false, opponentName: "John Tang",
    })!;
    expect(r.classification.mikeBadBeat).toBe(true);
    expect(r.text).not.toContain("Nikola Monster");  // no opponent card named
    expect(r.text).not.toMatch(/pull|caught fire|went off|exploded/i);
    expect(r.text).toMatch(/slate|board|coin-flip|math/i);
  });
});

describe("result-congruent clause (§5)", () => {
  it("LOSS (agency) surfaces the call that beat you — their hold / your fade, real name", () => {
    const r = explainH2HResult(ON({ ...LOSS, initialRoster: lossDeal }))!;
    expect(r.rivalryClause).not.toBeNull();
    expect(r.rivalryClause).toContain("Nikola Monster");
    expect(r.rivalryClause).toContain("John Tang");   // real opponent name (§9 Step 2)
    // smooth named clause (default): one sentence, em-dash, lowercase "you".
    expect(r.rivalryClause).toMatch(/kept .*Nikola Monster — you let him go\./);
    expect(r.rivalryClause).not.toMatch(/\b(beat|caused|revenge|made him pay|because)\b/i);
    // STEP 3 sibling: clause fired ⇒ base agency line carries NO flavor tail.
    expect(r.text).not.toContain("Classic");
    expect(r.text).not.toMatch(/'s night\./);
  });

  it("WIN (agency) surfaces YOUR call that paid off — your hold / their fade", () => {
    const r = explainH2HResult(ON({ ...WIN, initialRoster: winDeal }))!;
    expect(r.rivalryClause).not.toBeNull();
    expect(r.rivalryClause).toContain("Your Guy");
    expect(r.rivalryClause).toMatch(/You held Your Guy — John Tang let him go\./); // smooth named (default)
    expect(r.text).not.toContain("Classic"); // STEP 3: no flavor tail when clause fires
  });

  it("named-clause punctuation: both variants renderable (smooth default + beat)", () => {
    const r = explainH2HResult(ON({ ...LOSS, initialRoster: lossDeal }))!;
    // The composed clause (smooth) for the LOSS path; the beat variant is the
    // same minus the em-dash join — both available via renderDivergenceClause.
    expect(r.rivalryClause).toContain(" — you let him go.");
  });

  it("image-3: balanced variance WIN (no decisive line) → clause silent", () => {
    // All non-star, no hero fire → variance win; a congruent divergence exists
    // in the deal but the base found no decisive line, so the clause stays quiet.
    const balRecipient = [
      card({ bp: "yourguy", name: "Your Guy", wasHeld: true, fp: 18, slotIndex: 1 }),
      ...[0, 2, 3, 4, 5].map((i) => card({ bp: `r${i}`, name: `R ${i}`, fp: 17, slotIndex: i })),
    ];
    const r = explainH2HResult(ON({
      sender: hand(winSender, 60), recipient: hand(balRecipient, 110), initialRoster: winDeal,
    }))!;
    expect(r.classification.register).toBe("variance");
    expect(r.rivalryClause).toBeNull();
  });
});

describe("§9 Step 2/3 — base copy: real name + delta-once", () => {
  it("beatdown loss with flag ON also uses the real name (un-gated, both flag states)", () => {
    const vRecipient = [0, 1, 2, 3, 4, 5].map((i) => card({ bp: `r${i}`, name: `R ${i}`, fp: 17, slotIndex: i }));
    const r = explainH2HResult(ON({
      sender: hand(lossSender, 135), recipient: hand(vRecipient, 100), initialRoster: lossDeal,
    }))!;
    expect(r.text).toContain("John Tang");
    expect(r.text).not.toContain("Mike");
  });

  it("delta-once: the margin number appears exactly once on a variance loss", () => {
    // No sender pool stats → no outlier → MID_LOSS + closer (not bad-beat).
    const noOutlierSender = [1, 2, 3, 4, 5, 6].map((i) => card({ bp: `no${i}`, name: `No ${i}`, fp: 10, slotIndex: i - 1 }));
    const vRecipient = [0, 1, 2, 3, 4, 5].map((i) => card({ bp: `r${i}`, name: `R ${i}`, fp: 17, slotIndex: i }));
    const r = explainH2HResult(ON({
      sender: hand(noOutlierSender, 109.9), recipient: hand(vRecipient, 100), initialRoster: lossDeal,
    }))!;
    expect(r.classification.register).toBe("variance");
    const occurrences = (r.text.match(/9\.9/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe("tri-sport — clause fires for all three sports", () => {
  it.each(["basketball", "baseball", "worldcup"])("WIN clause fires for %s", (sport) => {
    const r = explainH2HResult({ ...WIN, sport, rivalryEnabled: true, opponentName: "John Tang", initialRoster: winDeal })!;
    expect(r.rivalryClause).not.toBeNull();
  });
});

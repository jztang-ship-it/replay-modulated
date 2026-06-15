// RD8 — explainH2HResult rivalry wiring: flag-gated clause + luck-outlier
// subsume (§4, §8.1, §8.3). Flag OFF must be byte-identical to today.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { explainH2HResult } from "../explainH2HResult";
import { registerPoolStatsProvider } from "../poolStatsProvider";
import type { PoolStats } from "../poolStats";

// ── Pool stats so the bad-beat path is reachable deterministically ──
const POOL: Record<string, PoolStats> = {
  monster: { n: 50, mean: 20, p10: 4, p50: 20, p90: 45, min: 0, max: 70 }, // fp60 → ~96th, swing 40
};
for (let i = 0; i < 6; i++) {
  POOL[`r${i}`] = { n: 50, mean: 12, p10: 4, p50: 12, p90: 28, min: 0, max: 40 }; // fp17 → ~63rd
  POOL[`s${i}`] = { n: 50, mean: 10, p10: 4, p50: 10, p90: 18, min: 0, max: 24 }; // low swing
}
beforeAll(() => registerPoolStatsProvider((bp) => POOL[bp] ?? null));
afterAll(() => registerPoolStatsProvider(() => null));

function card(o: Record<string, unknown>) {
  return {
    id: String(o.bp), basePlayerId: String(o.bp), personKey: String(o.bp), cardId: String(o.bp),
    name: o.name ?? "Filler", team: "X", season: "2023", position: "G", photoCode: null,
    salary: o.salary ?? 30, tier: o.tier ?? "BLUE", projectedFp: 30,
    slotIndex: o.slotIndex ?? 0, wasHeld: o.wasHeld ?? false, actualFp: o.fp ?? 17,
    fpDelta: 0, gameInfo: { date: "", opponent: "OPP" }, statLine: { pts: o.fp ?? 17, reb: 3, ast: 2 },
    achievements: [],
  };
}

// Recipient: 6 well-played BLUE cards (variance loss, no agency blame).
const recipientCards = [0, 1, 2, 3, 4, 5].map((i) =>
  card({ bp: `r${i}`, name: `Recip ${i}`, fp: 17, wasHeld: i < 2, slotIndex: i }),
);
// Sender: one monster outlier + fillers.
const senderCards = [
  card({ bp: "monster", name: "Nikola Monster", fp: 60, wasHeld: true, slotIndex: 0 }),
  ...[1, 2, 3, 4, 5].map((i) => card({ bp: `s${i}`, name: `Send ${i}`, fp: 10, wasHeld: false, slotIndex: i })),
];

function hand(cards: unknown[], totalFp: number) {
  return { handId: "h", totalFp, tier: "STARTER", cards, displayName: "Mike" } as never;
}

// Shared deal where slot0 (Nikola Monster) diverges: sender held, recipient faded
// (monster bp absent from recipient held-set). Other slots: neither holds → agree.
const dealWithDivergence = [
  card({ bp: "monster", name: "Nikola Monster", fp: 60, slotIndex: 0 }),
  ...[1, 2, 3, 4, 5].map((i) => card({ bp: `deal${i}`, name: `Deal ${i}`, slotIndex: i })),
] as never;

// A deal with NO divergence: dealt players nobody holds → all agree (both fade).
const dealNoDivergence = [1, 2, 3, 4, 5, 6].map((i) =>
  card({ bp: `none${i}`, name: `None ${i}`, slotIndex: i - 1 }),
) as never;

const LOSS = { sender: hand(senderCards, 112), recipient: hand(recipientCards, 100) }; // margin -12
const WIN = { sender: hand(senderCards, 100), recipient: hand(recipientCards, 120) }; // margin +20

describe("flag OFF — byte-identical to today (luck-outlier intact)", () => {
  it("rivalryClause is null and the bad-beat pull-frame still fires on a divergent loss", () => {
    const r = explainH2HResult({
      ...LOSS, sport: "basketball", initialRoster: dealWithDivergence, rivalryEnabled: false,
    })!;
    expect(r.rivalryClause).toBeNull();
    expect(r.classification.mikeBadBeat).toBe(true);
    expect(r.text.toLowerCase()).toContain("pull"); // "Mike just caught a monster … pull."
  });
});

describe("flag ON — clause fires + SUBSUME (§4, §8.1)", () => {
  it("divergent loss → rivalryClause set AND bad-beat suppressed (opponentOutlier nulled)", () => {
    const r = explainH2HResult({
      ...LOSS, sport: "basketball", initialRoster: dealWithDivergence, rivalryEnabled: true,
    })!;
    expect(r.rivalryClause).not.toBeNull();
    expect(r.rivalryClause).toContain("Nikola Monster");
    expect(r.classification.mikeBadBeat).toBe(false);       // subsumed
    expect(r.text.toLowerCase()).not.toContain("pull");     // bad-beat frame gone
  });

  it("fires on a WIN too (clause is outcome-agnostic)", () => {
    const r = explainH2HResult({
      ...WIN, sport: "basketball", initialRoster: dealWithDivergence, rivalryEnabled: true,
    })!;
    expect(r.rivalryClause).not.toBeNull();
    expect(r.rivalryClause).toContain("Nikola Monster");
  });

  it("no causal verb in the clause", () => {
    const r = explainH2HResult({
      ...LOSS, sport: "basketball", initialRoster: dealWithDivergence, rivalryEnabled: true,
    })!;
    expect(r.rivalryClause!).not.toMatch(/\b(beat|caused|revenge|made him pay|because)\b/i);
  });
});

describe("flag ON, no divergence — outlier path UNCHANGED (§8.3 conditional)", () => {
  it("rivalryClause null and bad-beat still fires when nothing diverged", () => {
    const r = explainH2HResult({
      ...LOSS, sport: "basketball", initialRoster: dealNoDivergence, rivalryEnabled: true,
    })!;
    expect(r.rivalryClause).toBeNull();
    expect(r.classification.mikeBadBeat).toBe(true);
    expect(r.text.toLowerCase()).toContain("pull");
  });
});

describe("tri-sport — selectDivergence is sport-agnostic over GeneratedCard", () => {
  it.each(["basketball", "baseball", "worldcup"])("clause fires for %s", (sport) => {
    const r = explainH2HResult({
      ...WIN, sport, initialRoster: dealWithDivergence, rivalryEnabled: true,
    })!;
    expect(r.rivalryClause).not.toBeNull();
  });
});

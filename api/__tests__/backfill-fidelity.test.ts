/**
 * api/__tests__/backfill-fidelity.test.ts
 *
 * Pre-execute gate for scripts/backfill-challenge-triggers.mjs.
 *
 * The dry-run's live-vs-recompute fidelity check only covers
 * anchor_base_player_id (the 2 already-populated rows in production are both
 * big_score / bad_beat — anchor-only trigger types). The other three columns
 *
 *   - near_miss_gap
 *   - near_miss_next_tier
 *   - top_game_tier
 *
 * have ZERO live-path fidelity coverage. --execute carries them on the
 * strength of the faithful-recompute gate alone.
 *
 * This test closes that gap with synthetic inputs of known shape, asserting
 * the EXACT column values the backfill would write. Inputs are constructed
 * to mirror the script's evaluateTrigger call shape (same `roster, totalFp,
 * winTier, badges, winTiersMap` plumbing the script uses), so the test
 * exercises the same code path as the backfill — not a tangent.
 *
 * Coverage scope:
 *   - miss        — near_miss_gap + near_miss_next_tier (uncovered)
 *   - rare_pull   — top_game_tier (uncovered)
 *   - bad_beat    — anchor_base_player_id (covered live, included for parity)
 *   - big_score   — anchor_base_player_id (covered live, included for parity)
 *
 * NOT a replacement for shared/utils/__tests__/triggerEvaluation.test.ts —
 * that covers evaluator branching. This file covers the column-mapping
 * contract the backfill relies on.
 */

import { describe, it, expect } from "vitest";
import { evaluateTrigger, type TriggerResult } from "@shared/utils/triggerEvaluation";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";

// ── Test fixtures ────────────────────────────────────────────────────────

function card(overrides: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1-x",
    name: "Player", team: "LAL", season: "2122", position: "SG",
    salary: 40, tier: "BLUE", projectedFp: 30, slotIndex: 0,
    actualFp: 30, fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" },
    achievements: [], wasHeld: false, ...overrides,
  } as GeneratedCard;
}

// Mirror of basketball legacy static tiers (matches the FALLBACK_MIN_FP
// shape in basketball/src/utils/payoutLogic.ts). Identical numbers to the
// fixtures in shared/utils/__tests__/triggerEvaluation.test.ts so this test's
// thresholds line up with the broader suite.
const TIERS: WinTierMap = {
  LEGEND:   { minFp: 255, multiplier: 50 },
  MVP:      { minFp: 235, multiplier: 8  },
  ALL_STAR: { minFp: 225, multiplier: 3  },
  STARTER:  { minFp: 205, multiplier: 1.5 },
  ROOKIE:   { minFp: 185, multiplier: 0.5 },
  BUST:     { minFp: 0,   multiplier: 0   },
};

/** Backfill-mirroring caller. The script invokes evaluateTrigger with EXACTLY
 *  these inputs (roster + totalFp + winTier + badges + winTiersMap; no
 *  topGameTier / starBasePlayerId / topGamePrimaryReason / topGameAllReasons
 *  for any non-rare_pull row) and maps the result to the 4 DB columns. This
 *  helper replicates both halves so the test exercises the same shape. */
function backfillRecompute(input: {
  roster: GeneratedCard[];
  totalFp: number;
  winTier: string;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  // Rare_pull-only inputs. Backfill omits these EXCEPT when the input
  // explicitly carries a topGameTier (the synthetic rare_pull case in this
  // test, which exists to prove the column wiring; the real backfill does
  // NOT have access to topGameTier and accepts the rare_pull drift-skip).
  topGameTier?: TriggerResult["topGameTier"];
  starBasePlayerId?: string | null;
}) {
  const badges = input.badges ?? input.roster.flatMap(c => c.achievements ?? []);
  const result = evaluateTrigger({
    roster: input.roster,
    totalFp: input.totalFp,
    winTier: input.winTier,
    badges,
    winTiersMap: TIERS,
    topGameTier: input.topGameTier,
    starBasePlayerId: input.starBasePlayerId,
  });
  return {
    trigger: result.trigger,
    near_miss_gap:         result.nearMissGap         ?? null,
    near_miss_next_tier:   result.nearMissNextTier    ?? null,
    anchor_base_player_id: result.anchorBasePlayerId  ?? null,
    top_game_tier:         result.topGameTier         ?? null,
  };
}

// ── miss: uncovered columns ──────────────────────────────────────────────

describe("backfill fidelity — miss (uncovered columns)", () => {
  it("STARTER 3 FP shy of ALL_STAR → near_miss_gap=3, near_miss_next_tier=ALL_STAR", () => {
    // STARTER threshold 205, ALL_STAR 225. 222 FP → gap 3 → fires miss.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 44.4 }));
    const out = backfillRecompute({ roster, totalFp: 222, winTier: "STARTER" });
    expect(out.trigger).toBe("miss");
    expect(out.near_miss_gap).toBe(3);
    expect(out.near_miss_next_tier).toBe("ALL_STAR");
    expect(out.anchor_base_player_id).toBeNull();
    expect(out.top_game_tier).toBeNull();
  });

  // Miss is only reachable from STARTER in practice: evaluateTrigger checks
  // the big_score branch (ALL_STAR/MVP/LEGEND) BEFORE the miss branch, so
  // an ALL_STAR-235-shy-of-MVP hand returns big_score, not miss. All
  // production miss rows are STARTER→ALL_STAR — the single miss row in the
  // dry-run (b2e24a47, totalFp=224, gap=1) matches this shape exactly.
  // Remaining tests stick to STARTER cases at varied gaps.

  it("STARTER 0.5 FP shy of ALL_STAR → near_miss_gap=0.5, near_miss_next_tier=ALL_STAR", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 44.9 }));
    const out = backfillRecompute({ roster, totalFp: 224.5, winTier: "STARTER" });
    expect(out.trigger).toBe("miss");
    expect(out.near_miss_gap).toBe(0.5);
    expect(out.near_miss_next_tier).toBe("ALL_STAR");
  });

  it("STARTER 5 FP shy of ALL_STAR (MISS_WINDOW upper edge) → near_miss_gap=5, near_miss_next_tier=ALL_STAR", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 44 }));
    const out = backfillRecompute({ roster, totalFp: 220, winTier: "STARTER" });
    expect(out.trigger).toBe("miss");
    expect(out.near_miss_gap).toBe(5);
    expect(out.near_miss_next_tier).toBe("ALL_STAR");
  });

  it("STARTER 6 FP shy of ALL_STAR (just past MISS_WINDOW) → trigger NOT miss", () => {
    // 219 FP → gap 6 → outside window → falls through to default.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 43.8 }));
    const out = backfillRecompute({ roster, totalFp: 219, winTier: "STARTER" });
    expect(out.trigger).not.toBe("miss");
    expect(out.near_miss_gap).toBeNull();
    expect(out.near_miss_next_tier).toBeNull();
  });
});

// ── rare_pull: uncovered columns ─────────────────────────────────────────

describe("backfill fidelity — rare_pull (uncovered columns)", () => {
  // The live backfill does NOT have access to topGameTier (it's sourced
  // from detectTopGame() at the GameView call site and isn't independently
  // reconstructible from final_roster + hand_log). The dry-run accepts that
  // every stored rare_pull row drift-skips. This synthetic test proves the
  // column-mapping contract assuming an input WITH topGameTier — so a
  // future code path that resurrects rare_pull recomputation (e.g. by
  // wiring detectTopGame into the backfill) emits the right DB shape.

  it("STARTER + topGameTier=record + star anchor → top_game_tier=record, anchor=p1", () => {
    const roster = Array(5).fill(null).map((_, i) =>
      card({ slotIndex: i, actualFp: 40, basePlayerId: `p${i + 1}` })
    );
    const out = backfillRecompute({
      roster, totalFp: 200, winTier: "STARTER",
      topGameTier: "record", starBasePlayerId: "p1",
    });
    expect(out.trigger).toBe("rare_pull");
    expect(out.top_game_tier).toBe("record");
    expect(out.anchor_base_player_id).toBe("p1");
    expect(out.near_miss_gap).toBeNull();
    expect(out.near_miss_next_tier).toBeNull();
  });

  it("topGameTier=career → top_game_tier=career", () => {
    const roster = Array(5).fill(null).map((_, i) =>
      card({ slotIndex: i, actualFp: 40, basePlayerId: `p${i + 1}` })
    );
    const out = backfillRecompute({
      roster, totalFp: 200, winTier: "STARTER",
      topGameTier: "career", starBasePlayerId: "p3",
    });
    expect(out.trigger).toBe("rare_pull");
    expect(out.top_game_tier).toBe("career");
    expect(out.anchor_base_player_id).toBe("p3");
  });

  it("topGameTier=season → top_game_tier=season", () => {
    const roster = Array(5).fill(null).map((_, i) =>
      card({ slotIndex: i, actualFp: 40, basePlayerId: `p${i + 1}` })
    );
    const out = backfillRecompute({
      roster, totalFp: 200, winTier: "STARTER",
      topGameTier: "season", starBasePlayerId: "p2",
    });
    expect(out.trigger).toBe("rare_pull");
    expect(out.top_game_tier).toBe("season");
    expect(out.anchor_base_player_id).toBe("p2");
  });

  it("NO topGameTier passed (production backfill shape) → rare_pull does NOT fire, all columns null", () => {
    // This is the actual rare_pull drift-skip path the backfill takes
    // today. Proves the dry-run's "rare_pull drift-skip: 1" outcome is
    // structural, not a code bug.
    const roster = Array(5).fill(null).map((_, i) =>
      card({ slotIndex: i, actualFp: 40, basePlayerId: `p${i + 1}` })
    );
    const out = backfillRecompute({ roster, totalFp: 200, winTier: "STARTER" });
    expect(out.trigger).not.toBe("rare_pull");
    expect(out.top_game_tier).toBeNull();
  });
});

// ── bad_beat: anchor parity (live-path covered) ──────────────────────────

describe("backfill fidelity — bad_beat anchor (live-covered, parity check)", () => {
  it("BUST with one held RED + held ORANGE — anchor = held card with worst (actual-projected) delta", () => {
    // Two held high-tier cards; the bad_beat anchor selects the one whose
    // (actualFp - projectedFp) landed most negative. p1 delta = -22,
    // p2 delta = -10. Expect p1.
    const roster = [
      card({ slotIndex: 0, tier: "RED",    basePlayerId: "p1", projectedFp: 30, actualFp:  8, wasHeld: true }),
      card({ slotIndex: 1, tier: "ORANGE", basePlayerId: "p2", projectedFp: 25, actualFp: 15, wasHeld: true }),
      card({ slotIndex: 2, tier: "WHITE",  basePlayerId: "p3", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE",  basePlayerId: "p4", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE",  basePlayerId: "p5", actualFp: 8 }),
    ];
    const out = backfillRecompute({ roster, totalFp: 47, winTier: "BUST" });
    expect(out.trigger).toBe("bad_beat");
    expect(out.anchor_base_player_id).toBe("p1");
    expect(out.near_miss_gap).toBeNull();
    expect(out.near_miss_next_tier).toBeNull();
    expect(out.top_game_tier).toBeNull();
  });

  it("BUST with equal-delta held cards — anchor tiebreak goes to higher salary", () => {
    // Both deltas = -10. p2 has higher salary → wins tiebreak.
    const roster = [
      card({ slotIndex: 0, tier: "RED",    basePlayerId: "p1", salary: 60, projectedFp: 30, actualFp: 20, wasHeld: true }),
      card({ slotIndex: 1, tier: "ORANGE", basePlayerId: "p2", salary: 75, projectedFp: 25, actualFp: 15, wasHeld: true }),
      card({ slotIndex: 2, tier: "WHITE",  basePlayerId: "p3", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE",  basePlayerId: "p4", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE",  basePlayerId: "p5", actualFp: 8 }),
    ];
    const out = backfillRecompute({ roster, totalFp: 51, winTier: "BUST" });
    expect(out.trigger).toBe("bad_beat");
    expect(out.anchor_base_player_id).toBe("p2");
  });
});

// ── big_score: anchor parity (live-path covered) ─────────────────────────

describe("backfill fidelity — big_score anchor (live-covered, parity check)", () => {
  it("ALL_STAR with clear top-FP card → anchor = highest actualFp", () => {
    const roster = [
      card({ slotIndex: 0, basePlayerId: "p1", actualFp: 45, wasHeld: true }),
      card({ slotIndex: 1, basePlayerId: "p2", actualFp: 50 }),
      card({ slotIndex: 2, basePlayerId: "p3", actualFp: 70 }), // top
      card({ slotIndex: 3, basePlayerId: "p4", actualFp: 35 }),
      card({ slotIndex: 4, basePlayerId: "p5", actualFp: 30 }),
    ];
    const out = backfillRecompute({ roster, totalFp: 230, winTier: "ALL_STAR" });
    expect(out.trigger).toBe("big_score");
    expect(out.anchor_base_player_id).toBe("p3");
  });

  it("ALL_STAR with runner-up within 1 FP — anchor prefers wasHeld in tiebreak window", () => {
    // p2 = top (70), p1 = within 1 FP (69.5) AND held → p1 wins.
    const roster = [
      card({ slotIndex: 0, basePlayerId: "p1", actualFp: 69.5, wasHeld: true }),
      card({ slotIndex: 1, basePlayerId: "p2", actualFp: 70.0 }),
      card({ slotIndex: 2, basePlayerId: "p3", actualFp: 40 }),
      card({ slotIndex: 3, basePlayerId: "p4", actualFp: 30 }),
      card({ slotIndex: 4, basePlayerId: "p5", actualFp: 25 }),
    ];
    const out = backfillRecompute({ roster, totalFp: 234.5, winTier: "ALL_STAR" });
    expect(out.trigger).toBe("big_score");
    expect(out.anchor_base_player_id).toBe("p1");
    expect(out.near_miss_gap).toBeNull();
    expect(out.near_miss_next_tier).toBeNull();
    expect(out.top_game_tier).toBeNull();
  });
});

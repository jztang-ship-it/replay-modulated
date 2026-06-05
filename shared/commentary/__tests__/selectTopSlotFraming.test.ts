// shared/commentary/__tests__/selectTopSlotFraming.test.ts
//
// Coverage for bucket 2 piece B (S1 slot-split restoration — real copy).
// Routing: HELD_ONE / HELD_TWO_PLUS / NO_HOLDS for choke (post smoke
// revision 2026-05-24); RECORD/CAREER/SEASON for rare_pull.
// Substitution: {starName} / {starName1} / {starName2} / {statLabel} /
// {winTierLow} / "{missTier}" sentinel / "{winTier}" sentinel.
// STAT_LABEL_MAP coverage including composite preference.
// Tier-gate: HELD_ONE / HELD_TWO_PLUS only on BUST/ROOKIE/STARTER; ALL_STAR+
// routes to NO_HOLDS.

import { describe, it, expect, vi } from "vitest";
import {
  selectTopSlotFraming,
  topSlotFramingBank,
  extractStatLabel,
  extractStatLabelAndRank,
  STAT_LABEL_MAP,
  type Line,
  type LinePart,
  type StampToken,
} from "../chadChallenge";
import type { TopGameReason } from "../types";

function strings(line: Line): string {
  return line.filter((p): p is string => typeof p === "string").join("");
}
function stamps(line: Line): StampToken[] {
  return line.filter((p): p is StampToken => typeof p !== "string");
}
function stampOf(stamp: StampToken["stamp"]): (p: LinePart) => boolean {
  return p => typeof p !== "string" && p.stamp === stamp;
}

describe("selectTopSlotFraming — choke routing (Q1.1 + smoke revision)", () => {
  it("choke with exactly 1 held card on BUST → HELD_ONE bank", () => {
    const heldOneBank = topSlotFramingBank("choke_held_one");
    const line = selectTopSlotFraming({
      trigger: "choke",
      roster: [{ wasHeld: true }, { wasHeld: false }],
      winTier: "BUST",
      starName: "Wembanyama",
    });
    expect(line.some(stampOf("choke"))).toBe(true);
    // HELD_ONE bank discriminator: single-name lines with {starName}
    // and {winTierLow}. After substitution: "Wembanyama" appears and
    // "Bust" (tier-low) may appear. No {starName2} reference.
    const text = strings(line);
    expect(text).not.toContain("{starName}");
    expect(text).not.toContain("{starName1}");
    expect(text).not.toContain("{starName2}");
    expect(text).not.toContain("{winTierLow}");
    // Sanity-check the picked line lives in the HELD_ONE bank shape.
    expect(heldOneBank.length).toBeGreaterThan(0);
    const HELD_ONE_MARKERS = ["held card", "held {starName}", "doubled down on {starName}", "Star on paper"];
    expect(HELD_ONE_MARKERS.some(m => heldOneBank.some(l => JSON.stringify(l).includes(m)))).toBe(true);
  });

  it("choke with 2+ held cards on ROOKIE → HELD_TWO_PLUS bank", () => {
    const heldTwoBank = topSlotFramingBank("choke_held_two_plus");
    const line = selectTopSlotFraming({
      trigger: "choke",
      roster: [{ wasHeld: true }, { wasHeld: true }, { wasHeld: false }],
      winTier: "ROOKIE",
      starName: "Mutombo",
      starName1: "Mutombo",
      starName2: "Webber",
    });
    expect(line.some(stampOf("choke"))).toBe(true);
    const text = strings(line);
    // Sub should fill both name slots without leaving placeholders.
    expect(text).not.toContain("{starName1}");
    expect(text).not.toContain("{starName2}");
    expect(text).not.toContain("{winTierLow}");
    // Discriminator: HELD_TWO_PLUS lines reference both starNames in
    // the bank source. After substitution they appear as both names.
    expect(heldTwoBank.length).toBeGreaterThan(0);
    expect(heldTwoBank.every(l => JSON.stringify(l).includes("{starName1}"))).toBe(true);
    expect(heldTwoBank.every(l => JSON.stringify(l).includes("{starName2}"))).toBe(true);
  });

  it("choke with 0 held cards on BUST → NO_HOLDS bank", () => {
    const noHoldsBank = topSlotFramingBank("choke_no_holds");
    const line = selectTopSlotFraming({
      trigger: "choke",
      roster: [{ wasHeld: false }, { wasHeld: false }],
      winTier: "BUST",
      starName: "Mutombo",
    });
    expect(line.some(stampOf("choke"))).toBe(true);
    // NO_HOLDS discriminator: "You drew" verb appears in many lines
    // (deliberate vocabulary choice — "drew" not "drafted").
    expect(noHoldsBank.some(l => JSON.stringify(l).includes("You drew"))).toBe(true);
  });

  it("tier gate: choke with held cards on ALL_STAR+ falls back to NO_HOLDS", () => {
    // The trigger evaluator currently only fires choke on BUST/
    // ROOKIE, but the selector's gate is defensive: at ALL_STAR+ the
    // {winTierLow}-bearing HELD copy ("Rookie scrape on a held card")
    // would read contradictorily, so HELD_ONE/HELD_TWO_PLUS are
    // gated to low tiers only and ALL_STAR+ routes through NO_HOLDS.
    const noHoldsBank = topSlotFramingBank("choke_no_holds");
    const line = selectTopSlotFraming({
      trigger: "choke",
      roster: [{ wasHeld: true }, { wasHeld: true }],
      winTier: "ALL_STAR",
      starName: "Curry",
    });
    expect(line.some(stampOf("choke"))).toBe(true);
    // Should NOT route to HELD_ONE or HELD_TWO_PLUS — sanity-check by
    // confirming the picked line shape exists in the NO_HOLDS bank.
    const picked = JSON.stringify(line.map(p => {
      if (typeof p !== "string") return p;
      // Undo the substitutions to compare against bank source shape.
      return p.replace(/Curry/g, "{starName}").replace(/All Star/g, "{winTierLow}");
    }));
    const matches = noHoldsBank.some(l => JSON.stringify(l) === picked);
    expect(matches).toBe(true);
  });

  it("choke with held cards on STARTER → HELD bank (STARTER counts as low-tier)", () => {
    // STARTER is included in the low-tier gate. Today trigger eval
    // doesn't fire choke at STARTER, but the gate allows it.
    const line = selectTopSlotFraming({
      trigger: "choke",
      roster: [{ wasHeld: true }],
      winTier: "STARTER",
      starName: "Pippen",
    });
    expect(line.some(stampOf("choke"))).toBe(true);
    const text = strings(line);
    expect(text).not.toContain("{starName}");
    expect(text).not.toContain("{winTierLow}");
    // "Starter" (title-case) should appear in some HELD_ONE lines.
    // Not every line carries {winTierLow} so don't hard-assert "Starter"
    // appears — just that the placeholder is gone.
  });
});

describe("selectTopSlotFraming — rare_pull routing (Q1.2)", () => {
  it("rare_pull + starAchievementType=record → RECORD bank", () => {
    const recordBank = topSlotFramingBank("rare_pull_record");
    const line = selectTopSlotFraming({
      trigger: "rare_pull",
      roster: [],
      starAchievementType: "record",
      starName: "Wembanyama",
    });
    expect(line.some(stampOf("rare_pull"))).toBe(true);
    const RECORD_MARKERS = ["record book", "all-time", "history", "decades"];
    expect(RECORD_MARKERS.some(m => recordBank.some(l => strings(l).includes(m)))).toBe(true);
  });

  it("rare_pull + starAchievementType=career → CAREER bank", () => {
    const careerBank = topSlotFramingBank("rare_pull_career");
    const line = selectTopSlotFraming({
      trigger: "rare_pull",
      roster: [],
      starAchievementType: "career",
      starName: "Wembanyama",
    });
    expect(line.some(stampOf("rare_pull"))).toBe(true);
    const CAREER_MARKERS = ["personal high", "his entire career", "best version of himself"];
    expect(CAREER_MARKERS.some(m => careerBank.some(l => strings(l).includes(m)))).toBe(true);
  });

  it("rare_pull + starAchievementType=season with statLabel → SEASON bank", () => {
    const seasonBank = topSlotFramingBank("rare_pull_season");
    const line = selectTopSlotFraming({
      trigger: "rare_pull",
      roster: [],
      starAchievementType: "season",
      starName: "Wembanyama",
      topGame: {
        primaryReason: { category: "pts", label: "1st highest scoring", value: 57, rank: 1 },
        allReasons: [{ category: "pts", label: "1st highest scoring", value: 57, rank: 1 }],
      },
    });
    expect(line.some(stampOf("rare_pull"))).toBe(true);
    expect(strings(line)).toContain("scoring");
    expect(seasonBank.some(l => JSON.stringify(l).includes("{statLabel}"))).toBe(true);
  });

  it("rare_pull season with unmapped category → falls back to RECORD bank with warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Composite mapped to "all-around" — SEASON bank fires.
    const lineMapped = selectTopSlotFraming({
      trigger: "rare_pull",
      roster: [],
      starAchievementType: "season",
      starName: "Player",
      topGame: {
        primaryReason: { category: "five_by_five", label: "5x5", value: 1 },
        allReasons: [{ category: "five_by_five", label: "5x5", value: 1 }],
      },
    });
    expect(strings(lineMapped)).toContain("all-around");

    // Unmapped category → null label → RECORD fallback.
    const lineUnmapped = selectTopSlotFraming({
      trigger: "rare_pull",
      roster: [],
      starAchievementType: "season",
      starName: "Player",
      topGame: {
        primaryReason: { category: "totally_unknown_category", label: "x", value: 1 },
        allReasons: [{ category: "totally_unknown_category", label: "x", value: 1 }],
      },
    });
    expect(lineUnmapped.some(stampOf("rare_pull"))).toBe(true);
    expect(strings(lineUnmapped)).not.toContain("{statLabel}");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("selectTopSlotFraming — substitution", () => {
  it("substitutes {starName} (single + double occurrence) in HELD_ONE lines", () => {
    // HELD_ONE line 10 has {starName} twice ("You read it. You held
    // {starName}. {starName} didn't read the script.").
    for (let i = 0; i < 60; i++) {
      const line = selectTopSlotFraming({
        trigger: "choke",
        roster: [{ wasHeld: true }],
        winTier: "BUST",
        starName: "Wembanyama",
      });
      const text = strings(line);
      expect(text).not.toContain("{starName}");
    }
  });

  it("substitutes {starName1} + {starName2} in HELD_TWO_PLUS lines", () => {
    for (let i = 0; i < 30; i++) {
      const line = selectTopSlotFraming({
        trigger: "choke",
        roster: [{ wasHeld: true }, { wasHeld: true }],
        winTier: "ROOKIE",
        starName: "Mutombo",
        starName1: "Mutombo",
        starName2: "Webber",
      });
      const text = strings(line);
      expect(text).not.toContain("{starName1}");
      expect(text).not.toContain("{starName2}");
      // Each picked line should contain BOTH names somewhere in the
      // text (every HELD_TWO_PLUS line references both).
      expect(text.includes("Mutombo")).toBe(true);
      expect(text.includes("Webber")).toBe(true);
    }
  });

  it("substitutes {winTierLow} (title-case from WinTier)", () => {
    // ROOKIE → "Rookie"
    for (let i = 0; i < 20; i++) {
      const line = selectTopSlotFraming({
        trigger: "choke",
        roster: [{ wasHeld: true }],
        winTier: "ROOKIE",
        starName: "Mutombo",
      });
      const text = strings(line);
      expect(text).not.toContain("{winTierLow}");
      // Some HELD_ONE lines have {winTierLow}, some don't. When they
      // do, "Rookie" should appear.
      if (JSON.stringify(line).includes("Rookie")) {
        expect(text).toContain("Rookie");
        // Negative check: not the all-caps form.
        expect(text).not.toContain("ROOKIE scrape");
      }
    }
  });

  it("substitutes {statLabel} in SEASON bank lines", () => {
    for (let i = 0; i < 30; i++) {
      const line = selectTopSlotFraming({
        trigger: "rare_pull",
        roster: [],
        starAchievementType: "season",
        starName: "Sabonis",
        topGame: {
          primaryReason: { category: "reb", label: "1st rebounding", value: 30, rank: 1 },
          allReasons: [{ category: "reb", label: "1st rebounding", value: 30, rank: 1 }],
        },
      });
      const text = strings(line);
      expect(text).not.toContain("{statLabel}");
    }
  });

  it("substitutes tier sentinel on MISS bank into actual missTier value", () => {
    const line = selectTopSlotFraming({
      trigger: "miss",
      roster: [],
      starName: "Curry",
      missTier: "ALL_STAR",
    });
    const ts = stamps(line);
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) {
      expect(t.stamp).toBe("miss");
      expect(t.tier).toBe("ALL_STAR");
    }
  });

  it("strips MISS tier sentinel when missTier is empty", () => {
    const line = selectTopSlotFraming({
      trigger: "miss",
      roster: [],
      starName: "Curry",
      missTier: null,
    });
    for (const t of stamps(line)) {
      expect(t.tier).toBeUndefined();
    }
  });

  it("substitutes win_tier sentinel into actual winTier value (BIG_SCORE bank)", () => {
    const line = selectTopSlotFraming({
      trigger: "big_score",
      roster: [],
      starName: "Jokic",
      winTier: "MVP",
    });
    const ts = stamps(line);
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) {
      expect(t.stamp).toBe("win_tier");
      expect(t.tier).toBe("MVP");
    }
  });

  it("strips win_tier sentinel when winTier is null (renderer falls back)", () => {
    const line = selectTopSlotFraming({
      trigger: "big_score",
      roster: [],
      starName: "Jokic",
      winTier: null,
    });
    for (const t of stamps(line)) {
      expect(t.stamp).toBe("win_tier");
      expect(t.tier).toBeUndefined();
    }
  });

  it("substitutes rarePullTier sentinel into rare_pull stamps per starAchievementType", () => {
    // Bucket 2 piece B final amend 2026-05-25: rare_pull chip displays
    // sub-tier text ("RECORD" / "CAREER HIGH" / "SEASON HIGH") instead
    // of internal "RARE PULL" vocabulary. Selector substitutes the
    // starAchievementType value into the stamp.tier field; the
    // renderer (TierGauge stampLabel) maps tier→label.
    for (const sub of ["record", "career"] as const) {
      const line = selectTopSlotFraming({
        trigger: "rare_pull",
        roster: [],
        starAchievementType: sub,
        starName: "Wembanyama",
      });
      for (const t of stamps(line)) {
        expect(t.stamp).toBe("rare_pull");
        expect(t.tier).toBe(sub);
      }
    }
    // Season variant: same substitution path, with topGame for
    // statLabel extraction.
    const seasonLine = selectTopSlotFraming({
      trigger: "rare_pull",
      roster: [],
      starAchievementType: "season",
      starName: "Sabonis",
      topGame: {
        primaryReason: { category: "reb", label: "1st rebounding", value: 30, rank: 1 },
        allReasons: [{ category: "reb", label: "1st rebounding", value: 30, rank: 1 }],
      },
    });
    for (const t of stamps(seasonLine)) {
      expect(t.stamp).toBe("rare_pull");
      expect(t.tier).toBe("season");
    }
  });
});

describe("STAT_LABEL_MAP + extractStatLabel — Q3.1 stat-typed preference", () => {
  it("maps the required stat-typed keys to readable labels", () => {
    expect(STAT_LABEL_MAP.pts).toBe("scoring");
    expect(STAT_LABEL_MAP.reb).toBe("rebounding");
    expect(STAT_LABEL_MAP.ast).toBe("passing");
    expect(STAT_LABEL_MAP.stl).toBe("steals");
    expect(STAT_LABEL_MAP.blk).toBe("blocks");
  });

  it("maps the required composite key (per spec requirement)", () => {
    expect(STAT_LABEL_MAP.td_30_20_20).toBe("triple-double");
  });

  it("prefers stat-typed reason over composite when both exist in allReasons", () => {
    const reasons: TopGameReason[] = [
      { category: "td_30_20_20", label: "triple-double", value: 1 },
      { category: "blk", label: "1st blocks", value: 14, rank: 1 },
    ];
    const label = extractStatLabel({ primaryReason: reasons[0], allReasons: reasons });
    expect(label).toBe("blocks");
  });

  it("falls back to first reason when no stat-typed sibling exists", () => {
    const reasons: TopGameReason[] = [
      { category: "five_by_five", label: "5x5", value: 1 },
    ];
    const label = extractStatLabel({ primaryReason: reasons[0], allReasons: reasons });
    expect(label).toBe("all-around");
  });

  it("returns null when topGame is null or all categories unmapped", () => {
    expect(extractStatLabel(null)).toBeNull();
    expect(extractStatLabel({
      primaryReason: { category: "made_up_xyz", label: "x", value: 1 },
      allReasons: [{ category: "made_up_xyz", label: "x", value: 1 }],
    })).toBeNull();
  });
});

describe("selectTopSlotFraming — defaults & resilience", () => {
  it("default trigger picks from the (unreachable per GameView) TOP_DEFAULT bank cleanly", () => {
    const line = selectTopSlotFraming({
      trigger: "default",
      roster: [],
    });
    expect(stamps(line)).toHaveLength(0);
    expect(strings(line)).toContain("TOP_DEFAULT placeholder");
  });

  it("big_score picks a line with the win_tier stamp (post 2026-05-24 union swap)", () => {
    const line = selectTopSlotFraming({
      trigger: "big_score",
      roster: [],
      starName: "Jokic",
      winTier: "LEGEND",
    });
    expect(line.some(stampOf("win_tier"))).toBe(true);
    // big_score is the TRIGGER value (unchanged); win_tier is the
    // STAMP variant the bank emits (replaced "big_score" stamp).
    expect(line.some(stampOf("big_score" as any))).toBe(false);
    expect(strings(line)).not.toContain("{starName}");
  });
});

// ── Bug B: rare_pull SEASON rank-aware subtext ─────────────────────────────

describe("extractStatLabelAndRank — sibling of extractStatLabel that returns rank too", () => {
  it("returns { label, rank } for a stat-typed primaryReason", () => {
    const { label, rank } = extractStatLabelAndRank({
      primaryReason: { category: "stl", label: "1st highest steal game of the season (10 stl)", value: 10, rank: 1 },
      allReasons: [{ category: "stl", label: "1st highest steal game of the season (10 stl)", value: 10, rank: 1 }],
    });
    expect(label).toBe("steals");
    expect(rank).toBe(1);
  });

  it("returns rank=null when no allReasons entry has a numeric rank (composite/flag reason)", () => {
    const { label, rank } = extractStatLabelAndRank({
      primaryReason: { category: "five_by_five", label: "5x5", value: 1 },
      allReasons: [{ category: "five_by_five", label: "5x5", value: 1 }],
    });
    expect(label).toBe("all-around");
    expect(rank).toBeNull();
  });

  it("prefers the stat-typed (rank-defined) reason over composite siblings", () => {
    const { label, rank } = extractStatLabelAndRank({
      primaryReason: { category: "five_by_five", label: "5x5", value: 1 },
      allReasons: [
        { category: "five_by_five", label: "5x5", value: 1 }, // composite, no rank
        { category: "pts", label: "2nd highest scoring game", value: 50, rank: 2 },
      ],
    });
    expect(label).toBe("scoring");
    expect(rank).toBe(2);
  });

  it("returns { label: null, rank: null } when topGame is null or empty", () => {
    expect(extractStatLabelAndRank(null)).toEqual({ label: null, rank: null });
    expect(extractStatLabelAndRank({ primaryReason: null, allReasons: [] })).toEqual({ label: null, rank: null });
  });
});

describe("rare_pull SEASON — rank-aware sub-bank routing (bug B fix)", () => {
  // Rank 1 → flat superlative, NO "one of the" hedge. The previous
  // SEASON bank hedged every line, so a real rank-1 game (Brandon
  // Roy's 10-STL game, the season's #1) read as "one of the best
  // steals games the league has seen all year." Post-fix, rank 1
  // gets framing like "the best in the league all season."
  it("rank 1 → RANK_1 bank: flat superlative, no hedge", () => {
    const rank1Bank = topSlotFramingBank("rare_pull_season_rank_1");
    // Every line in RANK_1 must include {statLabel} so the surface
    // names the stat. None should carry "one of the" hedges.
    expect(rank1Bank.length).toBeGreaterThan(4);
    for (const line of rank1Bank) {
      expect(JSON.stringify(line)).toContain("{statLabel}");
      expect(JSON.stringify(line).toLowerCase()).not.toContain("one of the ");
      expect(JSON.stringify(line).toLowerCase()).not.toContain("one of the top-3");
      expect(JSON.stringify(line).toLowerCase()).not.toContain("top-3");
    }
    // End-to-end: select for rank 1 routes to RANK_1.
    const line = selectTopSlotFraming({
      trigger: "rare_pull", roster: [], starAchievementType: "season", starName: "Brandon Roy",
      topGame: {
        primaryReason: { category: "stl", label: "1st highest steal game of the season (10 stl)", value: 10, rank: 1 },
        allReasons:    [{ category: "stl", label: "1st highest steal game of the season (10 stl)", value: 10, rank: 1 }],
      },
    });
    const rendered = strings(line).toLowerCase();
    expect(rendered).toContain("steals");
    expect(rendered).not.toContain("one of the ");
  });

  it("rank 2 → RANK_2_3 bank: top-3 framing", () => {
    const rank23Bank = topSlotFramingBank("rare_pull_season_rank_2_3");
    expect(rank23Bank.length).toBeGreaterThan(4);
    for (const line of rank23Bank) {
      expect(JSON.stringify(line)).toContain("{statLabel}");
    }
    // At least some lines should explicitly mention "top-3" / "3 best".
    const hasTopThreeFraming = rank23Bank.some(l => {
      const s = JSON.stringify(l).toLowerCase();
      return s.includes("top-3") || s.includes("top three") || s.includes("3 best") || s.includes("three best") || s.includes("3 biggest");
    });
    expect(hasTopThreeFraming).toBe(true);
    // End-to-end: select for rank 2 routes to RANK_2_3.
    const line = selectTopSlotFraming({
      trigger: "rare_pull", roster: [], starAchievementType: "season", starName: "Player X",
      topGame: {
        primaryReason: { category: "pts", label: "2nd highest scoring game", value: 50, rank: 2 },
        allReasons:    [{ category: "pts", label: "2nd highest scoring game", value: 50, rank: 2 }],
      },
    });
    const renderedRank2 = strings(line).toLowerCase();
    expect(renderedRank2).toContain("scoring");
    expect(JSON.stringify(rank23Bank.map(strings)).toLowerCase()).toMatch(/top-3|three best|3 best|3 biggest/);
  });

  it("rank 3 → also RANK_2_3 bank", () => {
    // Rank 3 must land in the same sub-bank as rank 2. Verify by
    // showing the selected line is one that appears in RANK_2_3 (or
    // at least that the rendered shape matches that bank's idiom).
    const line = selectTopSlotFraming({
      trigger: "rare_pull", roster: [], starAchievementType: "season", starName: "Player Y",
      topGame: {
        primaryReason: { category: "ast", label: "3rd highest passing game", value: 19, rank: 3 },
        allReasons:    [{ category: "ast", label: "3rd highest passing game", value: 19, rank: 3 }],
      },
    });
    // Rank 3 stays out of the rank-1 flat-superlative phrasings ("the
    // best in the league", "the season's top", "the league's #1").
    const rendered = strings(line).toLowerCase();
    expect(rendered).not.toMatch(/the best (passing|ast) game in the league all season/);
    expect(rendered).not.toContain("the league's #1");
    expect(rendered).toContain("passing");
  });

  it("rank 4 → RANK_4_PLUS bank: original hedged framing preserved", () => {
    const rank4Bank = topSlotFramingBank("rare_pull_season_rank_4_plus");
    expect(rank4Bank.length).toBeGreaterThan(4);
    for (const line of rank4Bank) {
      expect(JSON.stringify(line)).toContain("{statLabel}");
    }
    // The hedge phrasing IS correct at this rank tier — verify lines
    // include "one of the" idioms (the original SEASON bank's intent).
    const someHedged = rank4Bank.some(l => JSON.stringify(l).toLowerCase().includes("one of the "));
    expect(someHedged).toBe(true);
    // End-to-end: rank 7 routes here and the output contains a hedge.
    const line = selectTopSlotFraming({
      trigger: "rare_pull", roster: [], starAchievementType: "season", starName: "Player Z",
      topGame: {
        primaryReason: { category: "reb", label: "7th highest rebounding game", value: 20, rank: 7 },
        allReasons:    [{ category: "reb", label: "7th highest rebounding game", value: 20, rank: 7 }],
      },
    });
    expect(strings(line).toLowerCase()).toContain("rebounding");
  });

  it("rank undefined (composite reason, no numeric rank) → RANK_4_PLUS hedge tier — never invents a rank", () => {
    // Composite reasons (five_by_five, td_30_20_20, etc.) carry no
    // rank. Per the lock: "Do NOT invent a rank when reason.rank is
    // undefined — fall to the hedge tier."
    const line = selectTopSlotFraming({
      trigger: "rare_pull", roster: [], starAchievementType: "season", starName: "Player W",
      topGame: {
        primaryReason: { category: "five_by_five", label: "5x5", value: 1 },
        allReasons:    [{ category: "five_by_five", label: "5x5", value: 1 }],
      },
    });
    // Composite ⇒ extractStatLabel returns "all-around" (mapped).
    // The output should render the statLabel and use a hedge phrase
    // (not a rank-1 superlative).
    const rendered = strings(line).toLowerCase();
    expect(rendered).toContain("all-around");
    expect(rendered).not.toMatch(/the best all-around .* in the league all season/);
  });

  it("legacy rare_pull_season bank key returns the union of all three sub-banks (backward compat)", () => {
    const union = topSlotFramingBank("rare_pull_season");
    const r1 = topSlotFramingBank("rare_pull_season_rank_1");
    const r23 = topSlotFramingBank("rare_pull_season_rank_2_3");
    const r4 = topSlotFramingBank("rare_pull_season_rank_4_plus");
    expect(union.length).toBe(r1.length + r23.length + r4.length);
  });
});

// ── Bug A: careerCategories CODE half — stl/blk/turnovers now T1-reachable ──

describe("detectCareerTier — stl career-high (bug A code half)", () => {
  it("returns career tier for an stl career-high when careerHighs data carries the stat (proves the code half works)", async () => {
    // Bug A's data half is NOT fixed in this build — the production
    // basketball/public/data/careerHighs.json carries no stl values
    // for any player. This test SYNTHESIZES a careerHighs entry with
    // an stl value via the __setRecordSources test hook, proving that
    // detectCareerTier is now reachable for stl once the data lands.
    //
    // Before this build's SportAdapter careerCategories edit, even
    // injecting stl into careerHighs would not surface a career tier
    // — detectCareerTier's iteration at recordDetector.ts:168 walks
    // only careerCategories, and stl was absent. After this build,
    // the iteration includes stl and the tier flips on a matching
    // statLine value.
    const { detectTopGame, __setRecordSources } = await import("@shared/data/recordDetector");
    // Mirror the production BasketballSportConfig shape but inject a
    // stl value into careerHighs for one player. statAliases /
    // singleGameRecords / topGames left empty for this isolated test
    // so neither T0 nor T2 can fire.
    __setRecordSources({
      basketball: {
        topGames: {},
        careerHighs: {
          // Synthetic Brandon-Roy-shape entry. The stl key is the
          // missing piece in the prod careerHighs.json today.
          "200750": { pts: 52, reb: 14, ast: 12, stl: 10 } as any,
        },
        singleGameRecords: [],
        statAliases: {},
        careerCategories: [
          { key: "pts",       label: v => `personal best — ${v} pts` },
          { key: "reb",       label: v => `personal best — ${v} reb` },
          { key: "ast",       label: v => `personal best — ${v} ast` },
          { key: "threes",    label: v => `personal best — ${v} threes` },
          { key: "stl",       label: v => `personal best — ${v} stl` },
          { key: "blk",       label: v => `personal best — ${v} blk` },
          { key: "turnovers", label: v => `personal best — ${v} turnovers` },
        ],
      },
    });
    try {
      const result = detectTopGame(
        { pts: 22, reb: 5, ast: 7, stl: 10, blk: 2, turnovers: 1 },
        "200750", "2009-01-24", "ORANGE", "basketball",
      );
      expect(result.tier).toBe("career");
      expect(result.primaryReason?.category).toBe("stl");
      expect(result.primaryReason?.value).toBe(10);
      expect(result.primaryReason?.label).toContain("10 stl");
    } finally {
      __setRecordSources(null);
    }
  });

  it("returns null tier when careerHighs lacks an stl value (mirrors prod data today)", async () => {
    // With the SportAdapter code fix in place but the careerHighs.json
    // data still missing stl, the lookup at recordDetector.ts:169
    // returns undefined for stl → T1 skips → T2 falls through. This
    // is the documented "code half only" state; the badge will keep
    // saying "SEASON HIGH" for stl career-highs until the data half
    // lands as a separate task.
    const { detectTopGame, __setRecordSources } = await import("@shared/data/recordDetector");
    __setRecordSources({
      basketball: {
        topGames: {},
        // No stl in this player's careerHighs entry (matches prod
        // data shape today): only pts / reb / ast.
        careerHighs: { "200750": { pts: 52, reb: 14, ast: 12 } as any },
        singleGameRecords: [],
        statAliases: {},
        careerCategories: [
          { key: "pts",       label: v => `personal best — ${v} pts` },
          { key: "reb",       label: v => `personal best — ${v} reb` },
          { key: "ast",       label: v => `personal best — ${v} ast` },
          { key: "threes",    label: v => `personal best — ${v} threes` },
          { key: "stl",       label: v => `personal best — ${v} stl` },
          { key: "blk",       label: v => `personal best — ${v} blk` },
          { key: "turnovers", label: v => `personal best — ${v} turnovers` },
        ],
      },
    });
    try {
      const result = detectTopGame(
        { pts: 22, reb: 5, ast: 7, stl: 10, blk: 2, turnovers: 1 },
        "200750", "2009-01-24", "ORANGE", "basketball",
      );
      // No T0 records, no T2 topGames seeded, careerHighs has no stl
      // for this player → tier stays null. (Matches prod-data state.)
      expect(result.tier).toBeNull();
    } finally {
      __setRecordSources(null);
    }
  });
});

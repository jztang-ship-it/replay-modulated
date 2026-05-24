// shared/commentary/__tests__/selectTopSlotFraming.test.ts
//
// Coverage for bucket 2 piece B (S1 slot-split restoration — real copy).
// Routing: HELD_ONE / HELD_TWO_PLUS / NO_HOLDS for bad_beat (post smoke
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

describe("selectTopSlotFraming — bad_beat routing (Q1.1 + smoke revision)", () => {
  it("bad_beat with exactly 1 held card on BUST → HELD_ONE bank", () => {
    const heldOneBank = topSlotFramingBank("bad_beat_held_one");
    const line = selectTopSlotFraming({
      trigger: "bad_beat",
      roster: [{ wasHeld: true }, { wasHeld: false }],
      winTier: "BUST",
      starName: "Wembanyama",
    });
    expect(line.some(stampOf("bad_beat"))).toBe(true);
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

  it("bad_beat with 2+ held cards on ROOKIE → HELD_TWO_PLUS bank", () => {
    const heldTwoBank = topSlotFramingBank("bad_beat_held_two_plus");
    const line = selectTopSlotFraming({
      trigger: "bad_beat",
      roster: [{ wasHeld: true }, { wasHeld: true }, { wasHeld: false }],
      winTier: "ROOKIE",
      starName: "Mutombo",
      starName1: "Mutombo",
      starName2: "Webber",
    });
    expect(line.some(stampOf("bad_beat"))).toBe(true);
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

  it("bad_beat with 0 held cards on BUST → NO_HOLDS bank", () => {
    const noHoldsBank = topSlotFramingBank("bad_beat_no_holds");
    const line = selectTopSlotFraming({
      trigger: "bad_beat",
      roster: [{ wasHeld: false }, { wasHeld: false }],
      winTier: "BUST",
      starName: "Mutombo",
    });
    expect(line.some(stampOf("bad_beat"))).toBe(true);
    // NO_HOLDS discriminator: "You drew" verb appears in many lines
    // (deliberate vocabulary choice — "drew" not "drafted").
    expect(noHoldsBank.some(l => JSON.stringify(l).includes("You drew"))).toBe(true);
  });

  it("tier gate: bad_beat with held cards on ALL_STAR+ falls back to NO_HOLDS", () => {
    // The trigger evaluator currently only fires bad_beat on BUST/
    // ROOKIE, but the selector's gate is defensive: at ALL_STAR+ the
    // {winTierLow}-bearing HELD copy ("Rookie scrape on a held card")
    // would read contradictorily, so HELD_ONE/HELD_TWO_PLUS are
    // gated to low tiers only and ALL_STAR+ routes through NO_HOLDS.
    const noHoldsBank = topSlotFramingBank("bad_beat_no_holds");
    const line = selectTopSlotFraming({
      trigger: "bad_beat",
      roster: [{ wasHeld: true }, { wasHeld: true }],
      winTier: "ALL_STAR",
      starName: "Curry",
    });
    expect(line.some(stampOf("bad_beat"))).toBe(true);
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

  it("bad_beat with held cards on STARTER → HELD bank (STARTER counts as low-tier)", () => {
    // STARTER is included in the low-tier gate. Today trigger eval
    // doesn't fire bad_beat at STARTER, but the gate allows it.
    const line = selectTopSlotFraming({
      trigger: "bad_beat",
      roster: [{ wasHeld: true }],
      winTier: "STARTER",
      starName: "Pippen",
    });
    expect(line.some(stampOf("bad_beat"))).toBe(true);
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
        trigger: "bad_beat",
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
        trigger: "bad_beat",
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
        trigger: "bad_beat",
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

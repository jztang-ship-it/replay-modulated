// shared/commentary/__tests__/anchorTruth.test.ts
//
// Phase 3 lift gates (lock: docs/challenge-landing-v2-phase3-authored-
// voice-engine-lock.md). The honesty layer is shared by the take card
// AND the headline endpoint — these tests pin the 0.60/0.90 ratio gate
// so a future refactor can't silently shift either threshold.

import { describe, expect, it } from "vitest";
import {
  classifyAnchorTruth,
  DELIVERED_RATIO,
  TANKED_RATIO,
  type AnchorTruthCard,
  type ClassifyAnchorTruthInput,
} from "../anchorTruth";

// Shorthand roster card builder. Defaults to wasHeld:true so most tests
// can just override actualFp / projectedFp.
function card(
  basePlayerId: string,
  actualFp: number,
  projectedFp: number,
  wasHeld = true,
): AnchorTruthCard {
  return { basePlayerId, actualFp, projectedFp, wasHeld };
}

function input(over: Partial<ClassifyAnchorTruthInput> = {}): ClassifyAnchorTruthInput {
  return {
    roster: [card("anchor", 30, 40), card("other", 30, 40)],
    anchorBasePlayerId: "anchor",
    holdsRecorded: true,
    ...over,
  };
}

describe("classifyAnchorTruth — thresholds frozen at 0.90 / 0.60", () => {
  it("exposes the documented constants", () => {
    expect(DELIVERED_RATIO).toBe(0.90);
    expect(TANKED_RATIO).toBe(0.60);
  });
});

describe("classifyAnchorTruth — short-circuits to neutral", () => {
  it("legacy row (holdsRecorded:false) → neutral", () => {
    expect(classifyAnchorTruth(input({ holdsRecorded: false }))).toBe("neutral");
  });

  it("missing anchorBasePlayerId → neutral", () => {
    expect(classifyAnchorTruth(input({ anchorBasePlayerId: null }))).toBe("neutral");
    expect(classifyAnchorTruth(input({ anchorBasePlayerId: undefined }))).toBe("neutral");
  });

  it("fewer than two held cards → neutral (need an 'other' to indict)", () => {
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 50, 50)],
    }))).toBe("neutral");
  });

  it("anchor not in the held set → neutral", () => {
    expect(classifyAnchorTruth(input({
      roster: [card("a", 50, 50), card("b", 50, 50)],
      anchorBasePlayerId: "ghost",
    }))).toBe("neutral");
  });

  it("anchor in roster but not held → neutral", () => {
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 50, 50, false), card("other", 10, 50)],
    }))).toBe("neutral");
  });

  it("anchor projection ≤ 0 → neutral (ratio undefined)", () => {
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 0, 0), card("other", 10, 50)],
    }))).toBe("neutral");
  });
});

describe("classifyAnchorTruth — blamed (anchor ratio < 0.60)", () => {
  it("clearly tanked anchor → blamed regardless of others", () => {
    // anchor ratio 0.30 < 0.60
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 15, 50), card("other", 50, 50)],
    }))).toBe("blamed");
  });

  it("exactly at TANKED_RATIO is NOT blamed (strict <)", () => {
    // anchor ratio exactly 0.60 → not blamed; sits mid-zone with no other tanked → neutral
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 30, 50), card("other", 50, 50)],
    }))).toBe("neutral");
  });

  it("just below TANKED_RATIO → blamed", () => {
    // anchor ratio 0.598 < 0.60
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 29.9, 50), card("other", 50, 50)],
    }))).toBe("blamed");
  });
});

describe("classifyAnchorTruth — credited (anchor ≥ 0.90 AND ≥1 other tanked)", () => {
  it("anchor delivered, other tanked → credited", () => {
    // anchor ratio 0.94, other ratio 0.30
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 47, 50), card("other", 15, 50)],
    }))).toBe("credited");
  });

  it("exactly at DELIVERED_RATIO with other tanked → credited (>= check)", () => {
    // anchor ratio exactly 0.90, other ratio 0.30
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 45, 50), card("other", 15, 50)],
    }))).toBe("credited");
  });

  it("anchor delivered but NO other tanked → neutral", () => {
    // anchor 0.94, other 0.74 (mid-zone, not tanked)
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 47, 50), card("other", 37, 50)],
    }))).toBe("neutral");
  });

  it("anchor delivered but other has projectedFp=0 → ignores that 'other' → neutral", () => {
    // anchor 0.94, other projection undefined → can't qualify as tanked
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 47, 50), card("other", 5, 0)],
    }))).toBe("neutral");
  });

  it("anchor delivered with multiple others, at least one tanked → credited", () => {
    expect(classifyAnchorTruth(input({
      roster: [
        card("anchor", 47, 50),       // 0.94
        card("mid", 36, 50),          // 0.72 mid-zone
        card("tanked", 15, 50),       // 0.30 tanked
      ],
    }))).toBe("credited");
  });
});

describe("classifyAnchorTruth — mid-zone → neutral (the Kobe case)", () => {
  it("Kobe-style hand: anchor 0.78, other 0.87 → neutral", () => {
    // This is the real production scenario the lock calls out: both
    // stars had OK-not-bad nights, no honest credit/blame call exists.
    expect(classifyAnchorTruth(input({
      roster: [
        card("kobe", 32.4, 41.7),     // 0.777 — mid
        card("paul", 42.7, 48.9),     // 0.873 — mid
      ],
      anchorBasePlayerId: "kobe",
    }))).toBe("neutral");
  });

  it("anchor at upper mid-zone boundary (just below DELIVERED) → neutral", () => {
    // anchor ratio 0.899 < 0.90
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 44.95, 50), card("other", 10, 50)],
    }))).toBe("neutral");
  });

  it("anchor at lower mid-zone (just above TANKED) → neutral", () => {
    // anchor ratio 0.601
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 30.05, 50), card("other", 5, 50)],
    }))).toBe("neutral");
  });
});

describe("classifyAnchorTruth — held filter respects wasHeld", () => {
  it("ignores non-held cards when counting 'others'", () => {
    // anchor delivered; tanked card is wasHeld:false → does not count → neutral
    expect(classifyAnchorTruth(input({
      roster: [card("anchor", 47, 50), card("benched", 5, 50, false)],
    }))).toBe("neutral");
  });

  it("ignores non-held cards when counting the held minimum", () => {
    // Only one card actually held → neutral
    expect(classifyAnchorTruth(input({
      roster: [
        card("anchor", 47, 50, true),
        card("benched1", 0, 30, false),
        card("benched2", 0, 30, false),
      ],
    }))).toBe("neutral");
  });
});

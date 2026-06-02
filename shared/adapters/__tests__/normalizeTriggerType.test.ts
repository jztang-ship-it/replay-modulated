// shared/adapters/__tests__/normalizeTriggerType.test.ts
//
// Phase 1 trigger split (2026-06-03, docs/challenge-landing-v2-phase1-
// trigger-split-lock.md): the stored DB column `trigger_type` retains
// "bad_beat" on every pre-Phase-1 row; under the new model those rows
// mean choke. The mandatory back-compat is a single read-boundary alias
// at ChallengeLandingScreen.tsx:114 — see
// challengeTypes.normalizeTriggerType. These tests pin:
//   1. the alias itself maps "bad_beat" → "choke" and passes others through;
//   2. a stored-"bad_beat" value, when threaded through the recipient
//      intro selector via the alias, renders a CHOKE bank line (NOT empty
//      or default), proving the end-to-end path is sound.

import { describe, it, expect } from "vitest";
import { normalizeTriggerType } from "../challengeTypes";
import {
  selectRecipientIntro,
  selectIntroAnchor,
  recipientIntroBank,
} from "@shared/commentary/chadChallenge";
import type { GeneratedCard } from "@shared/types/index";

describe("normalizeTriggerType — Phase 1 read-boundary alias", () => {
  it("maps stored 'bad_beat' to 'choke'", () => {
    expect(normalizeTriggerType("bad_beat")).toBe("choke");
  });

  it("passes through 'choke' unchanged (new writes)", () => {
    expect(normalizeTriggerType("choke")).toBe("choke");
  });

  it("passes through the other Phase 1 triggers unchanged", () => {
    expect(normalizeTriggerType("miss")).toBe("miss");
    expect(normalizeTriggerType("big_score")).toBe("big_score");
    expect(normalizeTriggerType("rare_pull")).toBe("rare_pull");
    expect(normalizeTriggerType("default")).toBe("default");
  });

  it("handles null / undefined gracefully", () => {
    expect(normalizeTriggerType(null)).toBeUndefined();
    expect(normalizeTriggerType(undefined)).toBeUndefined();
  });
});

describe("normalizeTriggerType — stored 'bad_beat' row renders the CHOKE recipient intro", () => {
  it("normalized 'bad_beat' threads through selectRecipientIntro and produces a CHOKE bank line (not empty/default)", () => {
    // Simulate the legacy-row path: data.trigger_type === "bad_beat"
    // (stored), normalize at the boundary, thread the result through the
    // same selectRecipientIntro call path H2HRecipientPlay uses.
    const stored = "bad_beat";
    const normalized = normalizeTriggerType(stored);
    expect(normalized).toBe("choke");

    // Build a minimal anchor so the selector takes the anchor-bearing
    // path (vs. the default-only return) and lands in one of the CHOKE
    // banks per the t==="choke" branches at chadChallenge.ts ~1915-1929.
    const senderCards: GeneratedCard[] = [
      {
        id: "harden", basePlayerId: "harden", personKey: "harden", cardId: "harden-x",
        name: "Harden", team: "PHI", season: "2324", position: "SG",
        salary: 65, tier: "RED", projectedFp: 50, slotIndex: 0,
        actualFp: 18, fpDelta: -32, statLine: {}, gameInfo: { date: "", opponent: "" },
        achievements: [], wasHeld: true,
      },
      {
        id: "lebron", basePlayerId: "lebron", personKey: "lebron", cardId: "lebron-x",
        name: "LeBron", team: "LAL", season: "2324", position: "SF",
        salary: 60, tier: "ORANGE", projectedFp: 50, slotIndex: 1,
        actualFp: 22, fpDelta: -28, statLine: {}, gameInfo: { date: "", opponent: "" },
        achievements: [], wasHeld: true,
      },
    ];
    const anchor = selectIntroAnchor({
      triggerType: normalized,
      senderCards,
      anchorBasePlayerId: "harden",
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor, "anchor must resolve for the choke path").not.toBeNull();

    const line = selectRecipientIntro({
      triggerType: normalized,
      challengerName: "Mike",
      targetScore: 101,
      anchor,
      nearMissGap: null,
      nearMissNextTier: null,
    });

    // The returned Line is an Array<string | StampToken>. Render the
    // string parts and assert:
    //   (1) non-empty (didn't degrade to a falsy fallback);
    //   (2) contains the anchor name (proving the anchor-bearing CHOKE
    //       path fired, not the no-anchor / default fallback);
    //   (3) is NOT identical to any default/miss bank line (proving the
    //       choke path was selected, not the empty / default path).
    const flat = line.map(p => (typeof p === "string" ? p : "")).join("");
    expect(flat.length, "rendered line must be non-empty").toBeGreaterThan(0);
    expect(flat).toContain("Harden");

    // Cross-check: none of the non-choke bank line templates would
    // produce "Harden" substituted, because they don't carry {name}
    // anchor substitution (or they belong to other trigger paths). Pull
    // the default banks to confirm the rendered line isn't drawn from
    // them. (The choke banks are the only family that pairs {name} with
    // the "you held it and it died" frame; if the alias had failed,
    // selectRecipientIntro would have returned a default-bank line with
    // no anchor substitution.)
    const defaultBank = recipientIntroBank("default");
    const defaultFlat = defaultBank
      .map(l => l.map(p => (typeof p === "string" ? p : "")).join(""))
      .map(s => s.replace(/\{[^}]+\}/g, "")); // strip placeholders for comparison
    const flatStripped = flat.replace(/\{[^}]+\}/g, "");
    for (const def of defaultFlat) {
      expect(def, "rendered line must NOT be from the default bank").not.toBe(flatStripped);
    }
  });
});

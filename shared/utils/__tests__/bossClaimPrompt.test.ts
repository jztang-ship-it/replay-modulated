// @vitest-environment jsdom
// shared/utils/__tests__/bossClaimPrompt.test.ts
//
// Pins the claim-prompt eligibility model (pure logic — the CARD/timing is a
// glass surface, but the gate is deterministic and worth locking). Covers:
// won/registered/no-id gates, anti-repeat, after-launch baseline, and the
// ?claim=force DEV override.

import { describe, it, expect, beforeEach } from "vitest";
import {
  isClaimPromptEligible,
  ensureClaimBaseline,
  setLastPromptedBossId,
  claimForceParam,
} from "../bossClaimPrompt";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("isClaimPromptEligible", () => {
  it("eligible: won, fresh boss, not registered", () => {
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: true, registered: false })).toBe(true);
  });

  it("ineligible: not won / registered / missing id", () => {
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: false, registered: false })).toBe(false);
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: true, registered: true })).toBe(false);
    expect(isClaimPromptEligible({ bossId: undefined, won: true, registered: false })).toBe(false);
  });

  it("anti-repeat: same boss does NOT re-prompt; a NEW boss re-arms", () => {
    setLastPromptedBossId("DET-0304");
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: true, registered: false })).toBe(false);
    expect(isClaimPromptEligible({ bossId: "PHX-0607", won: true, registered: false })).toBe(true);
  });

  it("after-launch baseline: a pre-existing won boss is excluded; new wins qualify", () => {
    localStorage.setItem("rm_boss_result_DET-0304", JSON.stringify({ score: 130, won: true }));
    ensureClaimBaseline(); // snapshot already-won ids
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: true, registered: false })).toBe(false); // baselined
    expect(isClaimPromptEligible({ bossId: "PHX-0607", won: true, registered: false })).toBe(true);  // post-launch
  });

  it("baseline is set-once: a win recorded AFTER first snapshot still qualifies", () => {
    ensureClaimBaseline(); // empty baseline (no prior wins)
    localStorage.setItem("rm_boss_result_DET-0304", JSON.stringify({ score: 130, won: true }));
    ensureClaimBaseline(); // idempotent — does NOT re-snapshot the new win
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: true, registered: false })).toBe(true);
  });
});

describe("?claim=force DEV override", () => {
  it("force short-circuits every gate (DEV)", () => {
    window.history.replaceState({}, "", "/?claim=force");
    // Force only fires in DEV; vitest runs in dev mode (import.meta.env.DEV true).
    expect(claimForceParam()).toBe(true);
    // Overrides registered + not-won + anti-repeat all at once.
    setLastPromptedBossId("DET-0304");
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: false, registered: true })).toBe(true);
  });

  it("no force param → normal gating applies", () => {
    expect(claimForceParam()).toBe(false);
    expect(isClaimPromptEligible({ bossId: "DET-0304", won: false, registered: true })).toBe(false);
  });
});

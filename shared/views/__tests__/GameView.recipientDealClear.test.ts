// shared/views/__tests__/GameView.recipientDealClear.test.ts
//
// Phase 0 challenge-snapshot-enrichment "assert the neighbors" — the
// bleed test. The enriched snapshot now carries the sender's wasHeld;
// the recipient's own deal must zero those flags before the hand goes
// live. H2HRecipientPlay already has the clear at lines 371-374 (covered
// by its own test). This file pins the SECOND recipient-deal path:
// GameView.tsx's challenge-replay branch.
//
// Why static-source: GameView is a 3000-line component with deeply nested
// providers and async state; rendering it in a unit test just to assert
// a 1-line invariant is not worth the maintenance cost. A static-source
// check IS specific enough to catch the regression class we care about —
// "someone removed the wasHeld:false clear" — because the clear lives
// inside a narrow, named branch (`if (challengeCtx && challengeNextDealRef.current)`)
// that is easy to locate unambiguously.
//
// If the branch gets refactored, this test must be updated alongside.
// See docs/challenge-landing-v2-phase0-snapshot-enrichment-lock.md
// "Assert-the-neighbors".

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_VIEW_PATH = resolve(__dirname, "../GameView.tsx");

describe("GameView challenge-replay branch — recipient deal clears sender wasHeld", () => {
  it("contains the wasHeld:false clear inside the challenge-replay deal branch", () => {
    const src = readFileSync(GAME_VIEW_PATH, "utf8");
    // Locate the challenge-replay branch by its guard (unique in
    // GameView). Capture the body up through the next `} else {`. The
    // guard string appears only once in the file, so the lazy match is
    // unambiguous.
    const branchMatch = /if \(challengeCtx && challengeNextDealRef\.current\) \{([\s\S]*?)\} else \{/.exec(src);
    expect(branchMatch, "challenge-replay branch must exist at GameView.tsx:1672").not.toBeNull();
    const body = branchMatch![1];
    // The clear must zero wasHeld on every card in challengeCtx.initialRoster
    // before it becomes the recipient's playable hand. Pattern matches the
    // H2HRecipientPlay.tsx:371-374 spread-clear convention.
    expect(
      /wasHeld\s*:\s*false/.test(body),
      "sender wasHeld must be cleared in the challenge-replay deal branch before the recipient plays",
    ).toBe(true);
    expect(
      /\.map\(/.test(body),
      "the clear must be applied per-card (a .map over challengeCtx.initialRoster)",
    ).toBe(true);
  });
});

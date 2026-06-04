// shared/commentary/voice/__tests__/basketballVoice.byteIdentity.test.ts
//
// Phase 3 step 2 byte-identity guard, rebaselined for Phase 4 Pass 2.
//
// The original purpose: catch accidental drift between the named
// segment exports (BASKETBALL_REGISTER, _FACTUAL_ACCURACY, _TRADEMARK,
// _PERSONAL_LIFE, _GOLD_STANDARD) and the join-recomposed
// BASKETBALL_VOICE string used by basketball/src/utils/generateCulture.ts.
//
// Phase 4 Pass 2 (lock: docs/challenge-landing-v2-phase4-pass2-voice-
// foundation-lock.md §B) INTENTIONALLY rewrites BASKETBALL_REGISTER
// (Chad retirement + STRUCTURE flip), so the original Phase-3-era
// snapshot no longer matches by design. The snapshot file was
// regenerated against the post-Pass-2 segment exports; the test still
// catches future ACCIDENTAL drift between segments and the join.
//
// If this test fails again, check whether the snapshot was meant to
// move (lock-driven content change) or whether the join is drifting
// from the named segments (a structural bug to fix at the join site).
// Rebaseline only when there is a corresponding lock.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BASKETBALL_VOICE } from "../basketballVoice";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(HERE, "basketballVoice.snapshot.txt");

describe("BASKETBALL_VOICE — byte-identity guard (rebaselined Pass 2)", () => {
  it("recomposed string matches the captured snapshot byte-for-byte", () => {
    const snapshot = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(BASKETBALL_VOICE).toBe(snapshot);
  });

  it("snapshot file is non-empty (so the test cannot pass trivially)", () => {
    const snapshot = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(snapshot.length).toBeGreaterThan(0);
  });
});

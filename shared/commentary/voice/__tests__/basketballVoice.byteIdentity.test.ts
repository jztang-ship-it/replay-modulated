// shared/commentary/voice/__tests__/basketballVoice.byteIdentity.test.ts
//
// Phase 3 step 2 byte-identity guard. The Option A refactor segmented
// BASKETBALL_VOICE into named exports (BASKETBALL_REGISTER, _FACTUAL_
// ACCURACY, _TRADEMARK, _PERSONAL_LIFE, _GOLD_STANDARD) so the headline
// VOICE_CONTRACT can inherit the subset that applies cross-surface.
// generateCulture.ts still reads BASKETBALL_VOICE as one SYSTEM string,
// and the contract with the offline run is: bit-identical output before
// and after the refactor.
//
// The snapshot file (basketballVoice.snapshot.txt) was captured from
// the PRE-refactor BASKETBALL_VOICE string. The test below asserts the
// post-refactor recomposed value matches it byte-for-byte. Any whitespace
// drift, missing separator, or reordered section trips this test.
//
// If this test fails, the refactor is wrong. Do not edit the snapshot
// to make the test pass — fix the segment boundaries until the join
// reconstructs the original string.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BASKETBALL_VOICE } from "../basketballVoice";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(HERE, "basketballVoice.snapshot.txt");

describe("BASKETBALL_VOICE — byte-identity guard", () => {
  it("recomposed string matches the captured pre-refactor snapshot byte-for-byte", () => {
    const snapshot = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(BASKETBALL_VOICE).toBe(snapshot);
  });

  it("recomposed string preserves expected length (8373 chars)", () => {
    expect(BASKETBALL_VOICE.length).toBe(8373);
  });

  it("snapshot file is non-empty (so the test cannot pass trivially)", () => {
    const snapshot = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(snapshot.length).toBeGreaterThan(0);
  });
});

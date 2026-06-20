/**
 * api/__tests__/boss-bank-artifact-drift.test.ts
 *
 * Phase 2-fix, Commit 1 — drift guard for the committed boss bank artifact.
 *
 * bossBank.generated.json is a COMMITTED generated file (Strategy A). A
 * committed generated file must not silently rot: if someone edits the bank
 * (docs/boss-bank-v1.json), the season data, or the canonicalFp/band code
 * WITHOUT rerunning `npm run build:boss-bank`, the committed artifact and the
 * live join diverge. This test re-runs the SAME builder the script uses and
 * asserts the committed file byte-matches — so that divergence goes red.
 *
 * This is the epoch-unification discipline (one source of truth, pinned)
 * applied to data. The builder is imported from the script, so there is one
 * serialization path — no duplicated formatting to diverge.
 *
 * NOTE: re-runs loadBankBosses() (reads the 213 MB seasons dir) — slower than a
 * pure unit test, by design; it's the integrity check the committed artifact
 * needs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bossBankArtifactString, ARTIFACT_PATH } from "../../scripts/build-boss-bank.mjs";

describe("boss bank artifact — drift guard", () => {
  it("committed bossBank.generated.json byte-matches a fresh regeneration", () => {
    const committed = readFileSync(ARTIFACT_PATH, "utf8");
    const regenerated = bossBankArtifactString();
    // If this fails: someone changed the bank / season data / FP code without
    // running `npm run build:boss-bank`. Rerun it and commit the result.
    expect(regenerated).toBe(committed);
  });
});

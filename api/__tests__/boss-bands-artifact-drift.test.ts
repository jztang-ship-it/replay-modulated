/**
 * api/__tests__/boss-bands-artifact-drift.test.ts
 *
 * Phase 2-mount step-1 — drift guard for the committed per-season band artifact.
 * bossBands.generated.json is committed (Strategy A) and must byte-match a fresh
 * Monte-Carlo run (the run is seeded → deterministic). Edit the bands/inputs
 * without rerunning `npm run build:boss-bands` and this goes red.
 *
 * NOTE: re-runs the per-season Monte-Carlo (reads the per-season files) — slower
 * than a unit test, by design; it's the integrity check the committed artifact
 * needs (same pattern as boss-bank-artifact-drift.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bossBandsArtifactString, ARTIFACT_PATH } from "../../scripts/build-boss-bands.mjs";

describe("boss bands artifact — drift guard", () => {
  it("committed bossBands.generated.json byte-matches a fresh seeded regeneration", () => {
    const committed = readFileSync(ARTIFACT_PATH, "utf8");
    const regenerated = bossBandsArtifactString();
    expect(regenerated).toBe(committed);
  });
});

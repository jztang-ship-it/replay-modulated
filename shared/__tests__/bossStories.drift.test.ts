/**
 * Drift guard for the committed client boss-story map
 * (shared/data/bossStories.generated.json). Mirrors the bossBank artifact
 * guard: the committed file must byte-match a fresh regeneration from the
 * source bank (docs/boss-bank-v1.json). If someone edits a story in the bank
 * without running `node scripts/gen-boss-stories.mjs`, this goes red.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — plain .mjs generator, no types
import { buildBossStoriesJson, OUT } from "../../scripts/gen-boss-stories.mjs";

describe("boss story map — drift guard", () => {
  it("committed bossStories.generated.json byte-matches a fresh regeneration", () => {
    const committed = readFileSync(OUT as string, "utf8");
    const regenerated = (buildBossStoriesJson as () => string)();
    expect(regenerated).toBe(committed);
  });
});

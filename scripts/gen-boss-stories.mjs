/**
 * scripts/gen-boss-stories.mjs
 *
 * Generate the client boss-story map from the source bank — Path B (no DB
 * migration). Reads docs/boss-bank-v1.json and emits a bundled
 * { bankId -> story } JSON the SPA imports (shared/data/bossStories.generated.json).
 *
 * KEEP IN SYNC: edit the stories in docs/boss-bank-v1.json (the source), then
 * regenerate:  node scripts/gen-boss-stories.mjs
 * A drift test (shared/__tests__/bossStories.drift.test.ts) recomputes this and
 * byte-matches the committed file, so an out-of-sync map turns CI red.
 *
 * boss_identity_id on the challenge row == bank id (bossContract:
 * identityId = boss.key = bank id), so the client keys this map by the
 * boss_identity_id the GET now returns.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BANK = resolve(REPO, "docs/boss-bank-v1.json");
export const OUT = resolve(REPO, "shared/data/bossStories.generated.json");

/** Deterministic: map in the bank's entry order, only entries with a story. */
export function buildBossStoriesJson() {
  const bank = JSON.parse(readFileSync(BANK, "utf8"));
  const map = {};
  for (const b of bank.bosses) {
    if (typeof b.story === "string" && b.story.length > 0) map[b.id] = b.story;
  }
  return JSON.stringify(map, null, 2) + "\n";
}

// CLI entry: write the committed asset.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, buildBossStoriesJson());
  console.log("wrote", OUT);
}

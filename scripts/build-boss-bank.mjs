#!/usr/bin/env node
// scripts/build-boss-bank.mjs
//
// Phase 2-fix: precompute the static boss bank artifact.
//
// getTodaysBossChallengeId can't run in a deployed function — it read the bank
// + the 213 MB seasons dir via runtime-computed fs paths (path.resolve(REPO,…)
// / readdirSync(SEASONS_DIR)), which NFT can't trace and which ENOENT in
// /var/task. This script does that join ONCE at build/dev time (where the
// seasons dir exists) and serializes the SMALL trimmed shape the request path
// actually reads, so the function can import a ~84 KB static JSON instead.
//
// Reuses loadBankBosses() + loadBand() + loadBankVersion() verbatim — the same
// in-memory result the request path used to compute, minus the fs.
//
// Strategy (A): the OUTPUT is COMMITTED. The drift-guard test
// (api/__tests__/boss-bank-artifact-drift.test.ts) re-runs this builder and
// asserts the committed file byte-matches, so it can't silently rot — the
// epoch-unification discipline (one source of truth, pinned) applied to data.
//
// Run:  npm run build:boss-bank   (then commit the regenerated JSON)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadBankBosses, P_LO, P_HI } from "../basketball/src/tools/bossGenerator.ts";
import { loadBand } from "../basketball/src/tools/bossData.ts";
import { loadBankVersion } from "../basketball/src/tools/bossContract.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARTIFACT_PATH = resolve(HERE, "../api/boss/_lib/bossBank.generated.json");

/**
 * Build the trimmed artifact object — ONLY the fields the request path reads:
 *   - scheduleHeadline: era_id (anti-repeat), tier (weight)
 *   - rollGames:        key (seed) + starters[].{name,pos,gamePool}
 *   - materializeIdentity/sender: key, season, team, era_id, tier, display, flavor
 *   - rollBoss:         band {lo,hi}
 * version is stamped so the request path no longer needs loadBankVersion()'s
 * fs read. Nothing else (gp/avgMin/meanFp/expected/floor/ceiling/flags are
 * analytics, never read at request time).
 */
export function buildBossBankArtifact() {
  const bosses = loadBankBosses();
  const band = loadBand(P_LO, P_HI);
  const version = loadBankVersion();
  return {
    _meta: {
      version,
      p_lo: P_LO,
      p_hi: P_HI,
      generatedBy: "scripts/build-boss-bank.mjs",
      note: "Precomputed static boss bank (Phase 2-fix). The request path imports this; it never reads fs / the seasons dir. Regenerate via `npm run build:boss-bank` and commit. Drift-guarded by api/__tests__/boss-bank-artifact-drift.test.ts.",
    },
    band: { lo: band.lo, hi: band.hi },
    bosses: bosses.map((b) => ({
      key: b.key,
      season: b.season,
      team: b.team,
      era_id: b.era_id,
      tier: b.tier,
      display: b.display,
      flavor: b.flavor,
      starters: b.starters.map((s) => ({ name: s.name, pos: s.pos, gamePool: s.gamePool })),
    })),
  };
}

/**
 * The exact committed-file string — the SINGLE serialization both the writer
 * here and the drift-guard test use, so byte-match is guaranteed by
 * construction (no duplicated formatting logic to diverge).
 */
export function bossBankArtifactString() {
  // Compact (no indent): this is a generated, drift-guarded blob never edited
  // by hand, so git-diff readability buys nothing — and indenting the gamePool
  // arrays (one number per line) tripled the size (265 KB → ~84 KB compact).
  // Smaller bundle, same bytes-pinned guarantee.
  return JSON.stringify(buildBossBankArtifact()) + "\n";
}

// Guarded main — write only when run directly (not when imported by the test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(ARTIFACT_PATH, bossBankArtifactString());
  console.log("wrote", ARTIFACT_PATH);
}

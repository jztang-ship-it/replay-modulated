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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadBankBosses, rollBoss, K, SCHEDULE_EPOCH, P_LO, P_HI } from "../basketball/src/tools/bossGenerator.ts";
import { loadBand, REPO } from "../basketball/src/tools/bossData.ts";
import { loadBankVersion } from "../basketball/src/tools/bossContract.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARTIFACT_PATH = resolve(HERE, "../api/boss/_lib/bossBank.generated.json");

// Per-season bands (step-1 calibration input) + the marquee set. A boss is
// SERVEABLE only if its season has a band → gets a baked opaque target. The
// other bank bosses stay dormant (no target → fail-closed in ensureDailyInstance).
const BANDS = JSON.parse(
  readFileSync(resolve(HERE, "../api/boss/_lib/bossBands.generated.json"), "utf8"),
).bands;
const MARQUEE = new Set(["CHI-9798", "GSW-1516"]);
// The 15 vetted candidate bosses (step-1/3). Serveable = baked target, and we
// bake ONLY these keys — NOT every boss in a banded season (a band is per-season,
// so other bank bosses share the 14 banded seasons but weren't beatability-vetted;
// they stay dormant). This makes serveable == the vetted 15.
const CANDIDATES = new Set([
  "DET-0304", "PHI-0001", "SAC-0102", "DAL-1011", "TOR-0001", "BOS-0708", "SAS-1314",
  "PHX-0607", "HOU-9697", "DEN-2223", "MIL-2021", "LAL-1920", "OKC-2425",
  "CHI-9798", "GSW-1516",
]);
const SEASONS_DIR = resolve(REPO, "basketball/public/data/seasons");

// Lazy per-season {basePlayerId → {salary, tier}} from the stored players.json —
// the SAME salary/tier the runtime reads (parity), no recomputation.
const _salTierCache = new Map();
function salTier(season, basePlayerId) {
  let m = _salTierCache.get(season);
  if (!m) {
    m = new Map();
    const players = JSON.parse(readFileSync(resolve(SEASONS_DIR, season, "players.json"), "utf8"));
    for (const p of players) m.set(String(p.basePlayerId), { salary: Number(p.salary ?? 0), tier: String(p.tier ?? "WHITE") });
    _salTierCache.set(season, m);
  }
  return m.get(String(basePlayerId)) ?? { salary: 0, tier: "WHITE" };
}

// ── Per-boss roster reach (re-anchor soft-cap) ────────────────────────────────
// The re-anchored band targets OPTIMISED play, but the boss TARGET = the boss's
// fixed roster sum (invariant). So a season band only "takes" where the roster can
// reach it. We MC the roster's own realised distribution and cap the band at its
// P90 (its reachable strong roll): effLo=min(P25,rosterP90), effHi=min(P40,rosterP90),
// marquee target=min(P50,rosterP90). A soft roster (e.g. SAS-1314, P90 below its
// season P25) naturally falls to its reachable max — an easier "easy-day" boss —
// never a sub-floor or an unrollable number. Deterministic per-boss seed → drift-safe.
const ROSTER_MC_SEED = 0x9e3779b9;
const ROSTER_MC_N = 20000;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seedFromKey(key) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** Boss roster's realised-FP P90 — each starter scores a uniformly-random qualifying
 *  game (identical scoring to rollGames). Deterministic via a per-boss key seed. */
function rosterP90(b) {
  const rng = mulberry32((seedFromKey(b.key) ^ ROSTER_MC_SEED) >>> 0);
  const t = [];
  for (let i = 0; i < ROSTER_MC_N; i++) { let fp = 0; for (const s of b.starters) fp += s.gamePool[Math.floor(rng() * s.gamePool.length)]; t.push(fp); }
  t.sort((x, y) => x - y);
  return t[Math.min(t.length - 1, Math.floor(0.90 * t.length))];
}

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
    bosses: bosses.map((b) => {
      const seasonBand = BANDS[b.season];
      const base = {
        key: b.key,
        season: b.season,
        team: b.team,
        era_id: b.era_id,
        tier: b.tier,
        display: b.display,
        flavor: b.flavor,
        starters: b.starters.map((s) => ({ name: s.name, pos: s.pos, gamePool: s.gamePool })),
      };
      // OPAQUE-TARGET SEAM: bake a per-boss target (+ the playable/revealable five)
      // at BUILD time for SERVEABLE bosses (season has a band). Deterministic roll
      // (seed = SCHEDULE_EPOCH + key) against the season band — raid for marquee.
      // The engine consumes boss.target opaquely; it never rolls or assumes how the
      // target was derived. Recalibrate later = change this formula + regenerate +
      // re-commit, ZERO engine change. No band → no target → boss stays dormant
      // (fail-closed; never served with a null/fallback target).
      if (!seasonBand || !CANDIDATES.has(b.key)) return { ...base, marquee: MARQUEE.has(b.key), target: null, revealedFive: null };
      const marquee = MARQUEE.has(b.key);
      // Re-anchor (2026-06-26): aim the roll at the best-N band, capped at the
      // roster's reachable strong roll (rosterP90). Daily = window [P25,P40];
      // marquee = P50 target via raid mode. effLo is the floor rollBoss guarantees
      // (re-roll-to-≥floor); both bounds capped so the target never exceeds what the
      // roster can roll (graceful degradation — soft rosters fall to their reach).
      const p90 = rosterP90(b);
      // Both daily and marquee roll in DAILY mode so the floor-respecting fallback
      // lands the target AT the band floor (easiest roll >= floor), not above it.
      // Raid mode returns the FIRST roll >= threshold, which overshoots (a marquee
      // P50 target drifted to ~26% win); daily-mode-at-P50 hits the locked ~50%.
      let rollBand;
      if (marquee) {
        const tgt = Math.min(seasonBand.p50, p90); // ~50% win (2A), capped at roster reach
        rollBand = [tgt, tgt];
      } else {
        const effLo = Math.min(seasonBand.lo, p90);                 // P25 (75% win), or rosterP90 if soft
        const effHi = Math.max(effLo, Math.min(seasonBand.hi, p90)); // P40 (60% win), capped at roster reach
        rollBand = [effLo, effHi];
      }
      const roll = rollBoss(b, SCHEDULE_EPOCH, 0, "daily", rollBand, K);
      const revealedFive = b.starters.map((s, i) => {
        const st = salTier(b.season, s.basePlayerId);
        return {
          basePlayerId: s.basePlayerId ?? null,
          name: s.name, pos: s.pos, salary: st.salary, tier: st.tier,
          fp: Math.round((roll.picks[i]?.fp ?? 0) * 10) / 10,
        };
      });
      return { ...base, marquee, target: Math.round(roll.total * 10) / 10, revealedFive };
    }),
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

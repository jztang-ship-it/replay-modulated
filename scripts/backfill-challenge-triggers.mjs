#!/usr/bin/env node
/**
 * scripts/backfill-challenge-triggers.mjs
 *
 * Phase 5c S1 followup. Backfills the four trigger-detail columns on
 * shared_challenges rows that were created before 012_shared_challenges_trigger_detail
 * (or by code paths that didn't yet emit anchors) by recomputing the same
 * evaluateTrigger() the live write path uses, against the row's resolved
 * hand_log.final_roster.
 *
 *   Columns:  near_miss_gap, near_miss_next_tier, anchor_base_player_id, top_game_tier
 *   Source:   shared_challenges.hand_id → hand_log.{total_fp, tier, final_roster}
 *
 * Invocation (must run under tsx — the script imports the .ts evaluator):
 *
 *   npx tsx scripts/backfill-challenge-triggers.mjs                  # dry-run (default)
 *   npx tsx scripts/backfill-challenge-triggers.mjs --sample 5       # dry-run, first 5 rows
 *   npx tsx scripts/backfill-challenge-triggers.mjs --execute --max-rows N
 *                                                                    # GUARDED — see below
 *
 * LOCKED rules (do not soften):
 *
 *   (a) Faithful-recompute: write a row's columns ONLY when
 *       recompute.trigger === the stored trigger_type. Mismatch = logic drift;
 *       leave NULL, classify drift-skip, log it. No guessing.
 *
 *   (b) No output-as-input: do NOT feed a row's own stored top_game_tier
 *       back into evaluateTrigger as topGameTier. topGameTier is sourced
 *       from detectTopGame() at the live GameView call site (sport-registered
 *       record sources + the star's gameLogs). Reconstructing it in a
 *       backfill requires the full detectTopGame dependency chain, which
 *       this script intentionally does NOT carry. So rare_pull recompute
 *       runs WITHOUT topGameTier — it will return something other than
 *       rare_pull for almost every row, and those drift-skip. Honest ~0
 *       rare_pull would-write is the correct outcome.
 *
 *   (c) Edge-skip buckets (stay NULL, counted separately from drift-skip):
 *       - synthetic hand_id with no hand_log row
 *       - hand_log.final_roster is NULL
 *       - hand_log.final_roster is a JSON-encoded string (legacy shape)
 *       - sport with no winTiersMap loader wired into this script
 *
 *   (d) Dry-run logs would-write for already-populated rows too — the
 *       in-flight live writes are real fidelity-check signal. The
 *       --execute branch DOES skip already-populated rows (note in the
 *       guard, not active this pass).
 *
 * Output: ~/Desktop/replaymod-handoff/<YYYY-MM-DD>-trigger-backfill/dryrun.jsonl
 *         + a summary.json with the footer numbers.
 */

import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

import { evaluateTrigger } from "../shared/utils/triggerEvaluation.ts";
import { normalizeSeasonKey } from "../shared/engines/dataEngine.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 0. Args
// ─────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function takeArg(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}
const FLAG_EXECUTE  = argv.includes("--execute");
const FLAG_DRY_RUN  = argv.includes("--dry-run") || !FLAG_EXECUTE;
const SAMPLE_N      = takeArg("--sample") ? Number(takeArg("--sample")) : null;
const MAX_ROWS      = takeArg("--max-rows") ? Number(takeArg("--max-rows")) : null;

if (FLAG_EXECUTE) {
  // Guard. Locked off this pass. The shape below is what --execute WILL do
  // once unblocked:
  //
  //   - Re-fetch fresh challenge + hand_log rows (no caching from dry-run).
  //   - Recompute via the same evaluateTrigger import as the dry-run.
  //   - Faithful-recompute gate: write ONLY when recompute.trigger === stored
  //     trigger_type. Mismatch = drift-skip; do not touch.
  //   - Skip-on-overwrite: rows where ANY of the 4 detail columns
  //     (near_miss_gap, near_miss_next_tier, anchor_base_player_id,
  //     top_game_tier) are already non-null are NOT touched. Going-forward
  //     live writes are authoritative; the backfill does not double-write.
  //   - Requires --max-rows for batch bounding.
  //
  // Fidelity coverage gap (must be re-stated at execute time so a future
  // operator doesn't assume we have empirical match data on every column):
  //
  //   The dry-run's live-path fidelity check (already-populated rows recomputed
  //   and compared) covered ONLY anchor_base_player_id, because the only rows
  //   the live write path has populated to date are big_score + bad_beat
  //   (both anchor-only triggers). The near_miss_gap, near_miss_next_tier,
  //   and top_game_tier columns have ZERO live-path fidelity coverage —
  //   no row in production has been observed where the live path wrote
  //   one of these and we got to compare a recompute against it.
  //
  //   --execute carries those three columns on the strength of the
  //   faithful-recompute gate ALONE (recompute.trigger === stored), plus
  //   the recompute-fidelity vitest in api/__tests__/. Not on observed
  //   live-vs-recompute matches. Don't conflate the two.
  throw new Error(
    "[backfill] --execute is locked off this pass. Decision gate not cleared. " +
    "Re-enable by removing this guard AFTER human review of the dry-run summary."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Env + clients
// ─────────────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const env = {};
for (const line of readFileSync(join(REPO_ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPABASE_URL = env.SUPABASE_URL || "https://hnhrpwwznzokkfagfumb.supabase.co";
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sport → winTiersMap loaders
//
// evaluateTrigger only reads winTiersMap[nextTier]?.minFp (miss branch). We
// only need {minFp} per tier. Loaders return a minimal WinTierMap shape.
// Baseball / football aren't in the current usable set (all 26 are basketball)
// but the loaders are here for completeness.
// ─────────────────────────────────────────────────────────────────────────────
const basketballThresholds = JSON.parse(
  readFileSync(join(REPO_ROOT, "basketball/src/data/winThresholds.json"), "utf8"),
);

function winTiersForBasketball(seasonRaw) {
  // Use the shared normalizer the live path uses (dataEngine.normalizeSeasonKey).
  // shared_challenges.season can be stored as "2024-25" (label form) or
  // "2425" (directory key); normalizeSeasonKey handles both. Importing the
  // shared function avoids drift between this script and the live tier lookup.
  const season = normalizeSeasonKey(String(seasonRaw ?? ""));
  const t = basketballThresholds[season];
  if (!t) return null;
  return {
    LEGEND:   { minFp: t.LEGEND,   multiplier: 0 },
    MVP:      { minFp: t.MVP,      multiplier: 0 },
    ALL_STAR: { minFp: t.ALL_STAR, multiplier: 0 },
    STARTER:  { minFp: t.STARTER,  multiplier: 0 },
    ROOKIE:   { minFp: t.ROOKIE,   multiplier: 0 },
    BUST:     { minFp: 0,          multiplier: 0 },
  };
}

// Baseball / football: hardcoded — they're static across seasons (see
// baseball/src/utils/payoutLogic.ts:41, football/src/utils/payoutLogic.ts:51).
const BASEBALL_WIN_TIERS = {
  LEGEND:   { minFp: 310, multiplier: 0 },
  MVP:      { minFp: 260, multiplier: 0 },
  ALL_STAR: { minFp: 230, multiplier: 0 },
  STARTER:  { minFp: 200, multiplier: 0 },
  ROOKIE:   { minFp: 170, multiplier: 0 },
  BUST:     { minFp: 0,   multiplier: 0 },
};
const FOOTBALL_WIN_TIERS = {
  LEGEND:   { minFp: 215, multiplier: 0 },
  MVP:      { minFp: 192, multiplier: 0 },
  ALL_STAR: { minFp: 167, multiplier: 0 },
  STARTER:  { minFp: 150, multiplier: 0 },
  ROOKIE:   { minFp: 130, multiplier: 0 },
  BUST:     { minFp: 0,   multiplier: 0 },
};

function winTiersMapFor(sport, season) {
  if (sport === "basketball") return winTiersForBasketball(season);
  if (sport === "baseball")   return BASEBALL_WIN_TIERS;
  if (sport === "football")   return FOOTBALL_WIN_TIERS;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Output dir
// ─────────────────────────────────────────────────────────────────────────────
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = join(homedir(), "Desktop", "replaymod-handoff", `${DATE}-trigger-backfill`);
mkdirSync(OUT_DIR, { recursive: true });
const JSONL_PATH   = join(OUT_DIR, "dryrun.jsonl");
const SUMMARY_PATH = join(OUT_DIR, "summary.json");
writeFileSync(JSONL_PATH, ""); // truncate

function logRow(obj) { appendFileSync(JSONL_PATH, JSON.stringify(obj) + "\n"); }

// ─────────────────────────────────────────────────────────────────────────────
// 4. Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAllChallenges() {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("shared_challenges")
      .select("challenge_id, hand_id, sport, season, created_at, trigger_type, near_miss_gap, near_miss_next_tier, anchor_base_player_id, top_game_tier")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchHandLogsByHandIds(handIds) {
  const byHandId = new Map();
  const PAGE = 200;
  for (let i = 0; i < handIds.length; i += PAGE) {
    const slice = handIds.slice(i, i + PAGE);
    const { data, error } = await supa
      .from("hand_log")
      .select("hand_id, total_fp, tier, final_roster")
      .in("hand_id", slice);
    if (error) throw error;
    for (const r of data) byHandId.set(r.hand_id, r);
  }
  return byHandId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Main
// ─────────────────────────────────────────────────────────────────────────────
const CUTOVER_DATE = "2026-05-26T00:00:00Z";

const summary = {
  invocation: { dry_run: FLAG_DRY_RUN, sample_n: SAMPLE_N, max_rows: MAX_ROWS, execute: FLAG_EXECUTE },
  total_seen: 0,
  would_write: 0,
  drift_skip: 0,
  edge_skip: 0,
  edge_skip_buckets: {
    no_hand_log: 0,
    null_final_roster_pre_cutover: 0,
    null_final_roster_post_cutover: 0,
    string_typed_final_roster: 0,
    unsupported_sport: 0,
    missing_season_thresholds: 0,
  },
  would_write_by_trigger: {},
  drift_skip_by_trigger_stored: {},
  // Fidelity check — rows that already had any of the 4 columns set
  // (live writes from the going-forward path). Recompute is run; per-column
  // we classify EACH column as one of three states:
  //
  //   populated_match    — both sides non-null AND equal (real signal)
  //   populated_mismatch — at least one side non-null AND values differ
  //                        (live wrote X, recompute wrote Y; row-level fail)
  //   null_eq_null       — both sides null (vacuous; no signal either way)
  //
  // Row-level all_match is now "no mismatch on any column AND ≥1 populated
  // match." This rules out the case where a row is reported as a match
  // purely on null===null across all 4 columns (which would mean we never
  // observed the live path write anything to that row).
  already_populated_fidelity: {
    total: 0,
    row_all_match: 0,
    row_mismatch: 0,
    per_column: {
      near_miss_gap:         { populated_match: 0, populated_mismatch: 0, null_eq_null: 0 },
      near_miss_next_tier:   { populated_match: 0, populated_mismatch: 0, null_eq_null: 0 },
      anchor_base_player_id: { populated_match: 0, populated_mismatch: 0, null_eq_null: 0 },
      top_game_tier:         { populated_match: 0, populated_mismatch: 0, null_eq_null: 0 },
    },
    details: [],
  },
};

function classifyColumn(existingVal, recomputeVal) {
  const e = existingVal ?? null;
  const r = recomputeVal ?? null;
  if (e === null && r === null) return "null_eq_null";
  if (e === r) return "populated_match";
  return "populated_mismatch";
}

const challenges = await fetchAllChallenges();
summary.total_seen = challenges.length;

const handIds = [...new Set(challenges.map(c => c.hand_id))];
const handByHandId = await fetchHandLogsByHandIds(handIds);

let processed = 0;
for (const c of challenges) {
  if (SAMPLE_N != null && processed >= SAMPLE_N) break;
  processed++;

  // ── edge-skip bucketing ───────────────────────────────────────────────
  const hl = handByHandId.get(c.hand_id);
  if (!hl) {
    summary.edge_skip++;
    summary.edge_skip_buckets.no_hand_log++;
    logRow({ kind: "edge-skip", reason: "no_hand_log", challenge_id: c.challenge_id, trigger_type_stored: c.trigger_type });
    continue;
  }
  if (hl.final_roster == null) {
    summary.edge_skip++;
    if (c.created_at < CUTOVER_DATE) summary.edge_skip_buckets.null_final_roster_pre_cutover++;
    else                              summary.edge_skip_buckets.null_final_roster_post_cutover++;
    logRow({ kind: "edge-skip", reason: "null_final_roster", challenge_id: c.challenge_id, trigger_type_stored: c.trigger_type, created_at: c.created_at });
    continue;
  }
  if (!Array.isArray(hl.final_roster)) {
    summary.edge_skip++;
    summary.edge_skip_buckets.string_typed_final_roster++;
    logRow({ kind: "edge-skip", reason: "string_typed_final_roster", challenge_id: c.challenge_id, trigger_type_stored: c.trigger_type });
    continue;
  }

  const winTiersMap = winTiersMapFor(c.sport, c.season);
  if (!winTiersMap) {
    summary.edge_skip++;
    if (c.sport === "basketball") summary.edge_skip_buckets.missing_season_thresholds++;
    else                          summary.edge_skip_buckets.unsupported_sport++;
    logRow({ kind: "edge-skip", reason: "no_winTiersMap", challenge_id: c.challenge_id, sport: c.sport, season: c.season });
    continue;
  }

  // ── recompute (no output-as-input — see LOCKED rule (b)) ──────────────
  const roster = hl.final_roster;
  const totalFp = Number(hl.total_fp);
  const winTier = hl.tier;
  const badges = roster.flatMap(card => Array.isArray(card?.achievements) ? card.achievements : []);

  const recompute = evaluateTrigger({
    roster, totalFp, winTier, badges, winTiersMap,
    // topGameTier / starBasePlayerId / topGamePrimaryReason / topGameAllReasons
    // intentionally omitted. See LOCKED rule (b).
  });

  // ── faithful-recompute gate ──────────────────────────────────────────
  if (recompute.trigger !== c.trigger_type) {
    summary.drift_skip++;
    summary.drift_skip_by_trigger_stored[c.trigger_type] =
      (summary.drift_skip_by_trigger_stored[c.trigger_type] ?? 0) + 1;
    logRow({
      kind: "drift-skip", challenge_id: c.challenge_id,
      trigger_type_stored: c.trigger_type, trigger_type_recompute: recompute.trigger,
      hand: { total_fp: totalFp, tier: winTier },
    });
    continue;
  }

  // ── would-write ───────────────────────────────────────────────────────
  const wouldWrite = {
    near_miss_gap:         recompute.nearMissGap         ?? null,
    near_miss_next_tier:   recompute.nearMissNextTier    ?? null,
    anchor_base_player_id: recompute.anchorBasePlayerId  ?? null,
    top_game_tier:         recompute.topGameTier         ?? null,
  };
  summary.would_write++;
  summary.would_write_by_trigger[recompute.trigger] =
    (summary.would_write_by_trigger[recompute.trigger] ?? 0) + 1;

  // Fidelity check on already-populated rows — see LOCKED rule (d).
  // Per-column classification: populated_match / populated_mismatch / null_eq_null.
  // Row-level all_match requires zero populated_mismatch AND ≥1 populated_match
  // (so an all-null row can never be reported as a fidelity match).
  const anyAlreadySet =
    c.near_miss_gap != null || c.near_miss_next_tier != null ||
    c.anchor_base_player_id != null || c.top_game_tier != null;
  let fidelity = null;
  if (anyAlreadySet) {
    summary.already_populated_fidelity.total++;
    const existing = {
      near_miss_gap: c.near_miss_gap, near_miss_next_tier: c.near_miss_next_tier,
      anchor_base_player_id: c.anchor_base_player_id, top_game_tier: c.top_game_tier,
    };
    const perColumn = {
      near_miss_gap:         classifyColumn(existing.near_miss_gap,         wouldWrite.near_miss_gap),
      near_miss_next_tier:   classifyColumn(existing.near_miss_next_tier,   wouldWrite.near_miss_next_tier),
      anchor_base_player_id: classifyColumn(existing.anchor_base_player_id, wouldWrite.anchor_base_player_id),
      top_game_tier:         classifyColumn(existing.top_game_tier,         wouldWrite.top_game_tier),
    };
    for (const [col, cls] of Object.entries(perColumn)) {
      summary.already_populated_fidelity.per_column[col][cls]++;
    }
    const populatedMatches  = Object.values(perColumn).filter(c => c === "populated_match").length;
    const populatedMismatches = Object.values(perColumn).filter(c => c === "populated_mismatch").length;
    const rowAllMatch = populatedMismatches === 0 && populatedMatches >= 1;
    if (rowAllMatch) summary.already_populated_fidelity.row_all_match++;
    else             summary.already_populated_fidelity.row_mismatch++;
    fidelity = {
      existing, would_write: wouldWrite, per_column: perColumn,
      populated_matches: populatedMatches, populated_mismatches: populatedMismatches,
      row_all_match: rowAllMatch,
    };
    summary.already_populated_fidelity.details.push({
      challenge_id: c.challenge_id, trigger_type: c.trigger_type, ...fidelity,
    });
  }

  logRow({
    kind: "would-write", challenge_id: c.challenge_id, trigger_type: recompute.trigger,
    would_write: wouldWrite, fidelity,
  });

  if (MAX_ROWS != null && summary.would_write >= MAX_ROWS) break;
}

writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

// ─────────────────────────────────────────────────────────────────────────────
// 6. Footer
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n──────────── DRY-RUN FOOTER ────────────");
console.log(`mode: dry-run${SAMPLE_N != null ? ` (sample ${SAMPLE_N})` : ""}`);
console.log(`total_seen:     ${summary.total_seen}`);
console.log(`would_write:    ${summary.would_write}`);
console.log(`drift_skip:     ${summary.drift_skip}`);
console.log(`edge_skip:      ${summary.edge_skip}`);
console.log(`\nedge_skip_buckets:`);
for (const [k, v] of Object.entries(summary.edge_skip_buckets)) console.log(`  ${k}: ${v}`);
console.log(`\nwould_write_by_trigger:`);
for (const [k, v] of Object.entries(summary.would_write_by_trigger)) console.log(`  ${k}: ${v}`);
console.log(`\ndrift_skip_by_trigger_stored:`);
for (const [k, v] of Object.entries(summary.drift_skip_by_trigger_stored)) console.log(`  ${k}: ${v}`);
const af = summary.already_populated_fidelity;
console.log(`\nalready_populated_fidelity:`);
console.log(`  total rows checked:    ${af.total}`);
console.log(`  row_all_match:         ${af.row_all_match}    (zero populated_mismatch AND ≥1 populated_match)`);
console.log(`  row_mismatch:          ${af.row_mismatch}`);
console.log(`  per-column classification (sum across rows):`);
for (const [col, counts] of Object.entries(af.per_column)) {
  console.log(`    ${col}:`);
  console.log(`      populated_match:    ${counts.populated_match}   ← real signal`);
  console.log(`      populated_mismatch: ${counts.populated_mismatch}`);
  console.log(`      null_eq_null:       ${counts.null_eq_null}        ← vacuous (no signal)`);
}
if (af.details.length > 0) {
  console.log(`  row detail:`);
  for (const d of af.details) {
    console.log(`    - ${d.challenge_id} (${d.trigger_type})  populated_matches=${d.populated_matches}  populated_mismatches=${d.populated_mismatches}  row_all_match=${d.row_all_match}`);
    for (const [col, cls] of Object.entries(d.per_column)) {
      const ev = d.existing[col], rv = d.would_write[col];
      console.log(`        ${col.padEnd(22)} ${String(cls).padEnd(20)} existing=${JSON.stringify(ev)} recompute=${JSON.stringify(rv)}`);
    }
  }
}
console.log(`\noutput:`);
console.log(`  ${JSONL_PATH}`);
console.log(`  ${SUMMARY_PATH}`);

/**
 * generateCulture.ts — Culture database generator (v3, voice-locked + multi-mode)
 *
 * CANARY: CULTURE_TIER1_V1_20260517
 *
 * Three modes via CULTURE_MODE env var:
 *
 *   pilot    Reads culture_pilot_targets.json (an explicit allow-list of
 *            basePlayerIds + qualifyingTeams). Walks all 29 season
 *            players.json + gamelogs.json files. Generates entries with
 *            new key shape `lastname_<basePlayerId>` and teamEras blocks
 *            scoped to each target's qualifyingTeams list. Outputs to
 *            culture_pilot_review.ts (review file, NOT merged).
 *
 *   enrich   Reads existing playerCulture.ts entries, regenerates them
 *            in the new voice while preserving basePlayerId + key. Used
 *            once voice is locked to bring legacy entries up to the new
 *            standard. Outputs to culture_enrich_review.ts.
 *
 *   expand   Reads culture_expand_targets.json (full PURPLE+ list across
 *            all 29 seasons, sans pilot/enrich entries). Same generation
 *            shape as pilot. Outputs to culture_expand_review.ts.
 *
 * Resume logic: every mode reads its output file (if exists) and skips
 * any basePlayerId whose entry is already present — supports interrupted
 * runs without re-burning tokens.
 *
 * Dedup: a player at PURPLE in 2010 AND ORANGE in 2014 is ONE generation
 * job. basePlayerId is the dedup key, not (player, season).
 *
 * Usage (run from repo root):
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   export CULTURE_MODE=pilot
 *   npx tsx basketball/src/utils/generateCulture.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pickVoice } from "../../../shared/commentary/voice/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────
const BATCH_SIZE = 2;
const DELAY_MS = 3000;
const MAX_TOKENS = 8000;
const MODEL = "claude-sonnet-4-20250514";

type Mode = "pilot" | "enrich" | "expand";
const MODE: Mode = ((process.env.CULTURE_MODE as Mode) || "pilot");

const SEASONS_DIR = path.join(process.cwd(), "basketball/public/data/seasons");
const PILOT_TARGETS = path.join(__dirname, "culture_pilot_targets.json");
const PILOT_TEAMS = path.join(__dirname, "culture_pilot_teams.json");
// In expand mode we read the Tier 1 target file for this run. Future
// tiers will swap this path (or we'll add a CULTURE_BATCH env var).
const EXPAND_TARGETS = path.join(__dirname, "culture_tier1_targets.json");

function reviewPathFor(m: Mode): string {
  // Expand mode writes to the Tier 1 review/failed paths for this run.
  // Pilot/enrich keep mode-name-based filenames.
  if (m === "expand") return path.join(__dirname, "culture_tier1_review.ts");
  return path.join(__dirname, `culture_${m}_review.ts`);
}
function failedPathFor(m: Mode): string {
  if (m === "expand") return path.join(__dirname, "culture_tier1_failed.json");
  return path.join(__dirname, `culture_${m}_failed.json`);
}

// ── Types ───────────────────────────────────────────────────────────────────
interface PlayerEntry {
  id: string;
  basePlayerId: string;
  season: string;
  name: string;
  team: string;
  position: string;
  salary: number;
  tier: string;
  active?: boolean;
}

interface GameLog {
  basePlayerId: string;
  date: string;
  matchDate: string;
  season: string;
  opponent: string;
  homeAway: string;
  stats: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    turnovers: number;
    min: number;
  };
}

interface GameWithFP extends GameLog {
  fp: number;
}

interface PilotTarget {
  basePlayerId: string;
  name: string;
  lastNameKey: string;
  qualifyingTeams: string[];
}

interface PilotTargetsFile {
  players: PilotTarget[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function salaryTier(salary: number): string {
  if (salary >= 55) return "max";
  if (salary >= 40) return "star";
  if (salary >= 25) return "role";
  if (salary >= 15) return "value";
  return "flier";
}

function normalizeLast(name: string): string {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  const last = parts[parts.length - 1] ?? name;
  return last
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function computeFP(s: GameLog["stats"]): number {
  return s.pts + s.reb * 1.2 + s.ast * 1.5 + s.stl * 3 + s.blk * 3 - s.turnovers;
}

function readJsonOrNull<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

// ── Walk seasons: build basePlayerId → { player records + logs } ────────────
interface PlayerRollup {
  basePlayerId: string;
  name: string;
  /** All season records keyed by season — captures team and tier per season. */
  seasons: Record<string, { team: string; tier: string; salary: number; position: string }>;
  /** All game logs across all seasons. */
  logs: GameLog[];
}

function walkAllSeasons(): Map<string, PlayerRollup> {
  const rollups = new Map<string, PlayerRollup>();
  const seasonKeys = fs.readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  for (const s of seasonKeys) {
    const playersPath = path.join(SEASONS_DIR, s, "players.json");
    const logsPath = path.join(SEASONS_DIR, s, "gamelogs.json");
    const players: PlayerEntry[] = readJsonOrNull(playersPath) ?? [];
    const logs: GameLog[] = readJsonOrNull(logsPath) ?? [];
    for (const p of players) {
      if (!p.basePlayerId || !p.name) continue;
      const r = rollups.get(p.basePlayerId) ?? {
        basePlayerId: p.basePlayerId,
        name: p.name,
        seasons: {} as Record<string, { team: string; tier: string; salary: number; position: string }>,
        logs: [] as GameLog[],
      };
      r.seasons[s] = { team: p.team, tier: p.tier, salary: p.salary, position: p.position };
      rollups.set(p.basePlayerId, r);
    }
    for (const l of logs) {
      if (!l.basePlayerId) continue;
      const r = rollups.get(l.basePlayerId);
      if (r) r.logs.push(l);
    }
  }
  return rollups;
}

// ── Build game-data summary for the prompt (top games, season highs, etc.) ──
function buildSummary(logs: GameLog[]): string {
  if (!logs.length) return "(no game logs available)";
  const withFP: GameWithFP[] = logs.map(g => ({ ...g, fp: Math.round(computeFP(g.stats) * 10) / 10 }));
  const sorted = [...withFP].sort((a, b) => b.fp - a.fp);
  const top10 = sorted.slice(0, 10);

  const fmt = (g: GameWithFP) =>
    `${g.date} vs ${g.opponent}: ${g.stats.pts}p/${g.stats.reb}r/${g.stats.ast}a/${g.stats.stl}s/${g.stats.blk}b/${g.stats.turnovers}to (${g.stats.min}min) = ${g.fp}FP`;

  const tripleDoubles = withFP.filter(g => {
    const cats = [g.stats.pts, g.stats.reb, g.stats.ast, g.stats.stl, g.stats.blk];
    return cats.filter(c => c >= 10).length >= 3;
  });
  const fiftyPlus = withFP.filter(g => g.stats.pts >= 50);

  let out = "TOP 10 GAMES BY FP:\n";
  top10.forEach((g, i) => { out += `  ${i + 1}. ${fmt(g)}\n`; });

  const sh = (key: "pts" | "reb" | "ast"): GameWithFP =>
    withFP.reduce((a, b) => (a.stats[key] > b.stats[key] ? a : b));
  out += `\nSEASON HIGH PTS: ${fmt(sh("pts"))}`;
  out += `\nSEASON HIGH REB: ${fmt(sh("reb"))}`;
  out += `\nSEASON HIGH AST: ${fmt(sh("ast"))}`;

  if (tripleDoubles.length) {
    out += `\n\nTRIPLE-DOUBLES (${tripleDoubles.length}):\n`;
    tripleDoubles.slice(0, 5).forEach(g => { out += `  ${fmt(g)}\n`; });
  }
  if (fiftyPlus.length) {
    out += `\n50+ POINT GAMES:\n`;
    fiftyPlus.slice(0, 5).forEach(g => { out += `  ${fmt(g)}\n`; });
  }
  return out;
}

// ── System prompt — sourced from sport-specific voice module ──────────────
// The voice spec lives in shared/commentary/voice/<sport>Voice.ts.
// pickVoice() routes by sport key (default basketball). Edit the voice
// register there, not here — keeping it in shared/ lets future sports
// (football, baseball) plug in their own register without forking this
// generator.
const SPORT_KEY = (process.env.SPORT ?? "basketball").toLowerCase();
const SYSTEM = pickVoice(SPORT_KEY);

// ── Generate one batch ──────────────────────────────────────────────────────
interface BatchInput {
  basePlayerId: string;
  name: string;
  lastNameKey: string;
  salary: number;
  team: string;
  tier: string;
  qualifyingTeams: string[];
  gameDataSummary: string;
}

async function generateBatch(players: BatchInput[]): Promise<Array<{ key: string; basePlayerId: string; name: string; [k: string]: any }>> {
  const sections = players.map(p => {
    let s = `── ${p.name} (basePlayerId: ${p.basePlayerId}, lastNameKey: ${p.lastNameKey})`;
    s += `\nMost recent team/tier: ${p.team} / ${p.tier} / $${p.salary} (salaryTier: ${salaryTier(p.salary)})`;
    s += `\nqualifyingTeams (write teamEras for these only): ${JSON.stringify(p.qualifyingTeams)}`;
    s += `\n\nGAME DATA:\n${p.gameDataSummary}`;
    return s;
  }).join("\n\n─────────────────────────────────────────\n\n");

  const prompt = `Generate PlayerCulture entries for these ${players.length} NBA players. Use their REAL game data to ground bigGame, famousGameHint, signatureGames, and streakLines. Write teamEras blocks ONLY for the teams in each player's qualifyingTeams list.

${sections}

Return a JSON array with one object per player. Each object MUST start with these two fields, in this exact order:
{
  "key": "<lastNameKey>_<basePlayerId>",
  "basePlayerId": "<basePlayerId>",
  "name": "Full Name",
  "nicknames": [],
  "knownFor": "one sentence",
  "salaryTier": "max|star|role|value|flier",
  "tier1": [], "tier2": [], "tier3": [],
  "overperform": [], "underperform": [], "onPace": [],
  "turnovers": [], "defensive": [],
  "bigGame": [], "quietGame": [], "famousGameHint": [],
  "controversy": [],
  "opponentFlavor": {},
  "formerTeam": [], "rivalry": [], "milestones": [], "streakLines": [],
  "signatureGames": [{ "date": "YYYY-MM-DD", "opponent": "XXX", "fp": 0, "line": "" }],
  "salaryNarrative": [], "teamContext": [], "draftAndPath": [],
  "teamEras": {
    "XXX": { "framing": [], "bigGameVariant": "", "quietGameVariant": "" }
  }
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "[]";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// ── Format one entry as TypeScript (with teamEras + basePlayerId) ───────────
function toTypeScript(entry: any): string {
  const key = entry.key;
  const bid = entry.basePlayerId;
  const simpleFields = [
    "nicknames", "knownFor", "salaryTier",
    "tier1", "tier2", "tier3",
    "overperform", "underperform", "onPace",
    "turnovers", "defensive", "bigGame",
    "quietGame", "famousGameHint", "controversy",
    "formerTeam", "rivalry", "milestones",
    "streakLines", "salaryNarrative", "teamContext", "draftAndPath",
  ];

  // Force-string conversion before JSON.stringify so the LLM returning
  // basePlayerId as a JSON number doesn't emit an unquoted integer
  // (which fails the PlayerCulture interface's `basePlayerId: string`).
  const lines: string[] = [`  ${key}: {`, `    basePlayerId: ${JSON.stringify(String(bid))},`];

  for (const field of simpleFields) {
    const val = entry[field];
    if (val === undefined) {
      lines.push(`    ${field}: [],`);
    } else if (typeof val === "string") {
      lines.push(`    ${field}: ${JSON.stringify(val)},`);
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`    ${field}: [],`);
      } else {
        const items = val.map((v: string) => JSON.stringify(v)).join(", ");
        lines.push(`    ${field}: [${items}],`);
      }
    }
  }

  const opp = entry.opponentFlavor;
  if (opp && typeof opp === "object" && !Array.isArray(opp)) {
    const entries = Object.entries(opp).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
    lines.push(`    opponentFlavor: { ${entries} },`);
  } else {
    lines.push(`    opponentFlavor: {},`);
  }

  const sig = entry.signatureGames;
  if (Array.isArray(sig) && sig.length > 0) {
    lines.push(`    signatureGames: [`);
    for (const g of sig) {
      lines.push(`      { date: ${JSON.stringify(g.date)}, opponent: ${JSON.stringify(g.opponent)}, fp: ${g.fp}, line: ${JSON.stringify(g.line)} },`);
    }
    lines.push(`    ],`);
  } else {
    lines.push(`    signatureGames: [],`);
  }

  // teamEras block
  const eras = entry.teamEras;
  if (eras && typeof eras === "object" && !Array.isArray(eras)) {
    const eraKeys = Object.keys(eras);
    if (eraKeys.length) {
      lines.push(`    teamEras: {`);
      for (const tk of eraKeys) {
        const e = eras[tk];
        const framingArr = Array.isArray(e?.framing) ? e.framing.map((s: string) => JSON.stringify(s)).join(", ") : "";
        lines.push(`      ${tk}: {`);
        lines.push(`        framing: [${framingArr}],`);
        if (e?.bigGameVariant) lines.push(`        bigGameVariant: ${JSON.stringify(e.bigGameVariant)},`);
        if (e?.quietGameVariant) lines.push(`        quietGameVariant: ${JSON.stringify(e.quietGameVariant)},`);
        lines.push(`      },`);
      }
      lines.push(`    },`);
    }
  }

  lines.push(`  },`);
  return lines.join("\n");
}

// ── Resume: parse already-completed basePlayerIds from review file ──────────
function loadCompletedIds(reviewPath: string): Set<string> {
  if (!fs.existsSync(reviewPath)) return new Set();
  const txt = fs.readFileSync(reviewPath, "utf8");
  const ids = new Set<string>();
  // Match each entry's basePlayerId line
  const re = /basePlayerId:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(txt)) !== null) ids.add(m[1]);
  return ids;
}

// ── Target loaders per mode ─────────────────────────────────────────────────
function loadPilotTargets(): PilotTarget[] {
  const file = readJsonOrNull<PilotTargetsFile>(PILOT_TARGETS);
  if (!file) {
    console.error(`ERROR: ${PILOT_TARGETS} not found. Run Step 4 (build pilot target list) first.`);
    process.exit(1);
  }
  return file.players;
}

function loadExpandTargets(): PilotTarget[] {
  const file = readJsonOrNull<PilotTargetsFile>(EXPAND_TARGETS);
  if (!file) {
    console.error(`ERROR: ${EXPAND_TARGETS} not found. Build it before running expand mode.`);
    process.exit(1);
  }
  return file.players;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set.\n  export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }
  if (!["pilot", "enrich", "expand"].includes(MODE)) {
    console.error(`ERROR: CULTURE_MODE must be pilot | enrich | expand (got "${MODE}")`);
    process.exit(1);
  }

  console.log(`\n── ReplayMod Culture Generator v3 — mode=${MODE} ──`);
  console.log(`  Canary: CULTURE_TIER1_V1_20260517`);
  console.log(`  Model:  ${MODEL}`);
  console.log(`  Batch:  ${BATCH_SIZE}, Delay: ${DELAY_MS}ms, MaxTokens: ${MAX_TOKENS}`);

  // Walk all seasons once — used by every mode
  console.log(`  Walking seasons under ${SEASONS_DIR}...`);
  const rollups = walkAllSeasons();
  console.log(`  Indexed ${rollups.size} unique basePlayerIds across all seasons.\n`);

  // Resolve targets per mode
  let targets: PilotTarget[];
  if (MODE === "pilot") targets = loadPilotTargets();
  else if (MODE === "expand") targets = loadExpandTargets();
  else {
    // enrich: read existing playerCulture.ts entries
    console.error("enrich mode is not implemented yet — staged in Phase 2.");
    process.exit(1);
  }

  // Resume: skip already-completed basePlayerIds
  const reviewPath = reviewPathFor(MODE);
  const completed = loadCompletedIds(reviewPath);
  const todo = targets.filter(t => !completed.has(t.basePlayerId));
  console.log(`  Targets: ${targets.length} total | ${completed.size} already in ${path.basename(reviewPath)} | ${todo.length} to generate.\n`);

  if (todo.length === 0) {
    console.log("  Nothing to do. Exiting.");
    return;
  }

  // Build batch input
  const batchInput: BatchInput[] = todo.map(t => {
    const rollup = rollups.get(t.basePlayerId);
    if (!rollup) {
      console.warn(`  WARN: ${t.name} (${t.basePlayerId}) not found in season data — generating with empty game summary.`);
    }
    // Most recent season's team/tier/salary for "current shape" hint
    const allSeasonKeys = rollup ? Object.keys(rollup.seasons).sort() : [];
    const lastSeason = allSeasonKeys[allSeasonKeys.length - 1];
    const last = lastSeason && rollup ? rollup.seasons[lastSeason] : { team: "?", tier: "?", salary: 0, position: "?" };
    return {
      basePlayerId: t.basePlayerId,
      name: t.name,
      lastNameKey: t.lastNameKey,
      salary: last.salary,
      team: last.team,
      tier: last.tier,
      qualifyingTeams: t.qualifyingTeams,
      gameDataSummary: buildSummary(rollup?.logs ?? []),
    };
  });

  // Ensure review file has a header
  if (!fs.existsSync(reviewPath)) {
    fs.writeFileSync(
      reviewPath,
      `/**\n * culture_${MODE}_review.ts — Generated culture entries (${MODE} mode)\n * Generated: ${new Date().toISOString()}\n * Canary: CULTURE_TIER1_V1_20260517\n *\n * REVIEW each entry. Do NOT auto-merge into playerCulture.ts.\n */\n\n`,
      "utf8"
    );
  }

  const failed: Array<{ basePlayerId: string; name: string; error: string }> = [];
  let generated = 0;
  let batchNum = 0;
  const startMs = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < batchInput.length; i += BATCH_SIZE) {
    const batch = batchInput.slice(i, i + BATCH_SIZE);
    batchNum++;
    const names = batch.map(p => p.name).join(", ");
    process.stdout.write(`  Batch ${batchNum}/${Math.ceil(batchInput.length / BATCH_SIZE)}: ${names} ... `);

    try {
      // Capture usage by intercepting fetch — we re-call inside generateBatch
      // so we need a thin wrapper that returns usage too. Simpler: re-run the
      // fetch here, but that duplicates logic. For pilot scale (5 batches),
      // skip per-batch token logging — total tokens come from Vercel/Anthropic
      // dashboard. Comment in the report acknowledges this.
      const results = await generateBatch(batch);

      for (const result of results) {
        const ts = toTypeScript(result);
        // Header derives from the actual teamEras keys in the generated
        // entry, not from batch.find(...).qualifyingTeams. The lookup-by-
        // basePlayerId path could miss when result.basePlayerId came back
        // re-typed, causing "teams: undefined" headers. Deriving from the
        // entry itself is the source of truth — what's IN the entry is
        // what the reviewer sees.
        const eraTeams = result.teamEras && typeof result.teamEras === "object"
          ? Object.keys(result.teamEras).join("/")
          : "(no eras)";
        fs.appendFileSync(
          reviewPath,
          `// ${result.name} — basePlayerId ${result.basePlayerId} — teams: ${eraTeams}\n${ts}\n\n`,
          "utf8"
        );
        generated++;
      }
      console.log(`✓ (${results.length})`);
    } catch (err: any) {
      console.log(`✗ FAILED: ${err.message}`);
      batch.forEach(p => failed.push({ basePlayerId: p.basePlayerId, name: p.name, error: err.message }));
    }

    if (i + BATCH_SIZE < batchInput.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  if (failed.length) fs.writeFileSync(failedPathFor(MODE), JSON.stringify(failed, null, 2), "utf8");

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n── Done (${MODE}) ─────────────────────────────`);
  console.log(`  Generated:  ${generated} / ${batchInput.length}`);
  console.log(`  Failed:     ${failed.length}`);
  console.log(`  Wall time:  ${elapsedSec}s`);
  console.log(`  Review at:  ${path.relative(process.cwd(), reviewPath)}`);
  if (failed.length) console.log(`  Failed log: ${path.relative(process.cwd(), failedPathFor(MODE))}`);
  // Suppress unused-token vars (kept for future per-batch usage parsing)
  void totalInputTokens; void totalOutputTokens;
  console.log(`────────────────────────────────────────────────\n`);
}

main().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});

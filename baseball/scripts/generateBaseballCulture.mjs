#!/usr/bin/env node
/**
 * generateBaseballCulture.mjs — Overnight baseball culture database agent
 *
 * Reads baseball/public/data/mlb/players.json, generates culture entries
 * in batches via Claude API, writes a review file.
 *
 * Usage (run from repo root):
 *   ANTHROPIC_API_KEY=sk-... node baseball/scripts/generateBaseballCulture.mjs
 *
 * Output:
 *   baseball/src/utils/culture_review.ts   ← paste-ready entries to review
 *   baseball/src/utils/culture_failed.json ← any players that errored
 *
 * Env:
 *   MAX_PLAYERS  — limit run for testing, e.g. MAX_PLAYERS=10
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ───────────────────────────────────────────────────────────────────
const BATCH_SIZE = 3;
const DELAY_MS = 2000;
const MAX_PLAYERS = process.env.MAX_PLAYERS ? parseInt(process.env.MAX_PLAYERS, 10) : Infinity;

const PLAYERS_PATH = path.join(process.cwd(), "baseball/public/data/mlb/players.json");
const REVIEW_PATH = path.join(process.cwd(), "baseball/src/utils/culture_review.ts");
const FAILED_PATH = path.join(process.cwd(), "baseball/src/utils/culture_failed.json");

// ── Team name → abbreviation ──────────────────────────────────────────────────
const TEAM_NAME_TO_ABBR = {
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Oakland Athletics": "OAK", "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT", "San Diego Padres": "SDP", "San Francisco Giants": "SFG",
  "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
  "Athletics": "OAK", "Guardians": "CLE", "Diamondbacks": "ARI",
};

// ── Rivalry map ───────────────────────────────────────────────────────────────
const RIVALRIES = {
  NYY: [{ opponent: "BOS", label: "Yankees–Red Sox" }, { opponent: "NYM", label: "Subway Series" }],
  BOS: [{ opponent: "NYY", label: "Yankees–Red Sox" }],
  NYM: [{ opponent: "NYY", label: "Subway Series" }, { opponent: "ATL", label: "Mets–Braves" }],
  LAD: [{ opponent: "SFG", label: "Dodgers–Giants" }, { opponent: "SDP", label: "Battle of SoCal" }],
  SFG: [{ opponent: "LAD", label: "Dodgers–Giants" }, { opponent: "OAK", label: "Bay Bridge Series" }],
  SDP: [{ opponent: "LAD", label: "Battle of SoCal" }],
  CHC: [{ opponent: "STL", label: "Cubs–Cardinals" }],
  STL: [{ opponent: "CHC", label: "Cubs–Cardinals" }],
  HOU: [{ opponent: "TEX", label: "Lone Star Series" }],
  TEX: [{ opponent: "HOU", label: "Lone Star Series" }],
  ATL: [{ opponent: "NYM", label: "Braves–Mets" }],
  OAK: [{ opponent: "SFG", label: "Bay Bridge Series" }],
};

// ── Park factors ──────────────────────────────────────────────────────────────
const PARK_FACTORS = {
  COL: { factor: "HITTER", label: "Coors Field altitude" },
  CIN: { factor: "HITTER", label: "Great American Ball Park" },
  PHI: { factor: "HITTER", label: "Citizens Bank Park" },
  TEX: { factor: "HITTER", label: "Globe Life Field" },
  SFG: { factor: "PITCHER", label: "Oracle Park marine layer" },
  NYM: { factor: "PITCHER", label: "Citi Field" },
  SEA: { factor: "PITCHER", label: "T-Mobile Park" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function salaryTier(salary) {
  if (salary >= 55) return "MAX";
  if (salary >= 40) return "STAR";
  if (salary >= 28) return "SOLID";
  if (salary >= 16) return "VALUE";
  return "MIN";
}

function playerKey(name) {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return (parts[parts.length - 1] ?? name).toLowerCase().replace(/[^a-z]/g, "");
}

function loadExistingKeys() {
  const keys = new Set();
  for (const filePath of [REVIEW_PATH, path.join(process.cwd(), "baseball/src/utils/playerCulture.ts")]) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const m of content.matchAll(/^\s{2}([a-z]+):\s*\{/gm)) keys.add(m[1]);
  }
  return keys;
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a writer for ReplayMod, a fantasy baseball card game. You write player culture entries shown as commentary after each hand.

Voice: opinionated, specific, knowledgeable baseball fan. Short punchy sentences. Dry humor. Real historical references when they exist. Never generic. Never corporate. Think Baseball Reference meets The Athletic meets a bar argument about whether Bonds was clean.

Field rules:
- tier1: 2 lines. Simple direct fact or defining trait. For casual fans.
- tier2: 2 lines. Deeper lore a real fan knows. A specific season, award, trade, or moment.
- tier3: 1-2 lines. Niche or obscure. For diehards only.
- overperform: 2-3 lines. Player beat their projection. Celebratory but specific to this player.
- underperform: 2-3 lines. Player fell short. Honest, not cruel.
- onPace: 2 lines. Player hit their average. Reliability acknowledged.
- bigGame: 2-3 lines. Tease that this stat line might be a famous game worth looking up.
- quietGame: 1-2 lines. Quiet game. Specific to their tendencies.
- famousGameHint: 2-3 lines. Encourage the user to look up the box score.
- formerTeam: 3-4 lines. Player performing vs a former team. Emotionally specific. Reference the actual team name and history.
- rivalry: 3-4 lines. Rivalry game context. Reference actual franchise history and why it matters.
- salaryUnder: 3-4 lines. Big contract, underperforming. If you know the deal, reference the approximate value. Dry and pointed.
- salaryOver: 2-3 lines. Outperforming their deal. Appreciative and specific.
- parkBoost: 1-2 lines. Helped by a hitter-friendly park. Name the park.
- parkSuppressed: 1-2 lines. Hurt by a pitcher-friendly park. Name the park.

Max 90 chars per line. Never use the word "lineup". Never be generic. Every line must be specific to this exact player.
Salary tiers: MAX=$55+, STAR=$40-54, SOLID=$28-39, VALUE=$16-27, MIN=under$16

Return ONLY a valid JSON array, one object per player. No markdown. No code fences. No explanation.`;

// ── Generate one batch ────────────────────────────────────────────────────────
async function generateBatch(players) {
  const playerList = players.map(p => {
    const abbr = TEAM_NAME_TO_ABBR[p.mlbTeam] ?? p.mlbTeam ?? "?";
    const rivalries = RIVALRIES[abbr]?.map(r => r.label).join(", ") ?? "none";
    const park = PARK_FACTORS[abbr]
      ? `${PARK_FACTORS[abbr].factor} park (${PARK_FACTORS[abbr].label})`
      : "neutral park";
    return `- "${p.name}" | team: ${p.mlbTeam ?? "?"} (${abbr}) | pos: ${p.position ?? "?"} | salary: $${p.salary ?? "?"} | tier: ${salaryTier(p.salary ?? 0)} | rivalries: ${rivalries} | park: ${park}`;
  }).join("\n");

  const prompt = `Generate BaseballPlayerCulture entries for these ${players.length} MLB players:
${playerList}

For formerTeam lines: use your real knowledge of where this player previously played. Name the specific team.
For rivalry lines: use the rivalry label listed above. Reference real history between those franchises.
For salaryUnder/salaryOver: reference the approximate contract value if you know it (e.g. "$340M deal").
For parkBoost/parkSuppressed: reference the specific park named above.

Return a JSON array. Each object must have ALL these keys:
{
  "key": "lastname_lowercase_no_special_chars",
  "name": "Full Name",
  "nicknames": [],
  "knownFor": "one sentence under 90 chars",
  "salaryTier": "MAX|STAR|SOLID|VALUE|MIN",
  "tier1": [], "tier2": [], "tier3": [],
  "overperform": [], "underperform": [], "onPace": [],
  "bigGame": [], "quietGame": [], "famousGameHint": [],
  "formerTeam": [], "rivalry": [],
  "salaryUnder": [], "salaryOver": [],
  "parkBoost": [], "parkSuppressed": []
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "";
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`JSON parse failed. Raw: ${clean.slice(0, 300)}`);
  }
}

// ── Serialize to TypeScript ───────────────────────────────────────────────────
function toTypeScript(key, entry) {
  const arr = v => {
    if (!Array.isArray(v) || v.length === 0) return "[]";
    return `[\n${v.map(s => `      "${String(s).replace(/"/g, '\\"')}",`).join("\n")}\n    ]`;
  };

  return `  ${key}: {
    nicknames: ${arr(entry.nicknames)},
    knownFor: "${String(entry.knownFor ?? "").replace(/"/g, '\\"')}",
    salaryTier: "${entry.salaryTier ?? "VALUE"}",
    tier1: ${arr(entry.tier1)},
    tier2: ${arr(entry.tier2)},
    tier3: ${arr(entry.tier3)},
    overperform: ${arr(entry.overperform)},
    underperform: ${arr(entry.underperform)},
    onPace: ${arr(entry.onPace)},
    bigGame: ${arr(entry.bigGame)},
    quietGame: ${arr(entry.quietGame)},
    famousGameHint: ${arr(entry.famousGameHint)},
    formerTeam: ${arr(entry.formerTeam)},
    rivalry: ${arr(entry.rivalry)},
    salaryUnder: ${arr(entry.salaryUnder)},
    salaryOver: ${arr(entry.salaryOver)},
    parkBoost: ${arr(entry.parkBoost)},
    parkSuppressed: ${arr(entry.parkSuppressed)},
  },`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY env var not set.");
    process.exit(1);
  }
  if (!fs.existsSync(PLAYERS_PATH)) {
    console.error(`ERROR: players.json not found at:\n  ${PLAYERS_PATH}`);
    console.error("Run the MLB import first: node baseball/scripts/mlb-import.mjs");
    process.exit(1);
  }

  const allPlayers = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"));
  const existingKeys = loadExistingKeys();

  const missing = allPlayers
    .filter(p => p.name && !existingKeys.has(playerKey(p.name)))
    .slice(0, MAX_PLAYERS);

  console.log("\n── Baseball Culture Generator ───────────────────────");
  console.log(`  Total players:      ${allPlayers.length}`);
  console.log(`  Already generated:  ${existingKeys.size}`);
  console.log(`  Need entries:       ${missing.length}`);
  console.log(`  Est. time:          ~${Math.ceil(missing.length / BATCH_SIZE * (DELAY_MS / 1000 + 8))}s`);
  console.log(`  Output:             baseball/src/utils/culture_review.ts`);
  console.log("─────────────────────────────────────────────────────\n");

  if (missing.length === 0) {
    console.log("Nothing to generate — all players already have entries.");
    return;
  }

  // Init or append to review file
  if (!fs.existsSync(REVIEW_PATH)) {
    fs.mkdirSync(path.dirname(REVIEW_PATH), { recursive: true });
    fs.writeFileSync(REVIEW_PATH,
      `/**\n * culture_review.ts — Generated baseball entries awaiting approval\n * Review each entry, edit as needed, then paste into playerCulture.ts\n * Generated: ${new Date().toISOString()}\n */\n// ── PASTE INTO PLAYER_CULTURE in baseball/src/utils/playerCulture.ts ──\n\n`,
      "utf8"
    );
  }

  const failed = [];
  let generated = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missing.length / BATCH_SIZE);
    const names = batch.map(p => p.name).join(", ");
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${names} ... `);

    try {
      const results = await generateBatch(batch);
      for (const result of results) {
        const key = result.key || playerKey(result.name);
        const playerData = batch.find(p => p.name === result.name);
        fs.appendFileSync(REVIEW_PATH,
          `// ${result.name} ($${playerData?.salary ?? "?"})\n${toTypeScript(key, result)}\n\n`,
          "utf8"
        );
        generated++;
      }
      console.log(`✓ (${results.length} entries)`);
    } catch (err) {
      console.log(`✗ FAILED: ${err.message}`);
      batch.forEach(p => failed.push({ name: p.name, error: err.message }));
    }

    if (i + BATCH_SIZE < missing.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  if (failed.length > 0) {
    fs.writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2), "utf8");
  }

  console.log(`\n── Done ─────────────────────────────────────────────`);
  console.log(`  Generated:  ${generated} entries`);
  console.log(`  Failed:     ${failed.length}`);
  console.log(`  Review at:  baseball/src/utils/culture_review.ts`);
  if (failed.length > 0) console.log(`  Failures:   baseball/src/utils/culture_failed.json`);
  console.log("─────────────────────────────────────────────────────\n");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });

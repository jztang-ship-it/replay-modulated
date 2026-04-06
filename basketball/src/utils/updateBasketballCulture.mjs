#!/usr/bin/env node
/**
 * updateBasketballCulture.mjs — Adds new commentary angles to existing entries
 *
 * Finds players in culture_review.ts or playerCulture.ts that are missing
 * the new fields (formerTeam, rivalry, salaryUnder, salaryOver) and
 * generates those fields only, appending a patch file for review.
 *
 * Usage (run from repo root):
 *   ANTHROPIC_API_KEY=sk-... node basketball/src/utils/updateBasketballCulture.mjs
 *
 * Output:
 *   basketball/src/utils/culture_update.ts   ← patch entries to merge in
 *   basketball/src/utils/culture_update_failed.json
 *
 * Env:
 *   MAX_PLAYERS — limit for testing, e.g. MAX_PLAYERS=10
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────────
const BATCH_SIZE  = 4; // slightly larger — these are shorter outputs
const DELAY_MS    = 2000;
const MAX_PLAYERS = process.env.MAX_PLAYERS ? parseInt(process.env.MAX_PLAYERS, 10) : Infinity;

const PLAYERS_PATH  = path.join(process.cwd(), "basketball/public/data/players.json");
const CULTURE_PATH  = path.join(process.cwd(), "basketball/src/utils/playerCulture.ts");
const REVIEW_PATH   = path.join(process.cwd(), "basketball/src/utils/culture_review.ts");
const UPDATE_PATH   = path.join(process.cwd(), "basketball/src/utils/culture_update.ts");
const FAILED_PATH   = path.join(process.cwd(), "basketball/src/utils/culture_update_failed.json");

// ── NBA rivalry map ───────────────────────────────────────────────────────────
const RIVALRIES = {
  LAL: [{ opponent: "BOS", label: "Lakers–Celtics" }, { opponent: "LAC", label: "Battle of LA" }],
  BOS: [{ opponent: "LAL", label: "Lakers–Celtics" }, { opponent: "MIA", label: "Heat–Celtics" }],
  MIA: [{ opponent: "BOS", label: "Heat–Celtics" }, { opponent: "NYK", label: "Heat–Knicks" }],
  CHI: [{ opponent: "DET", label: "Bulls–Pistons" }, { opponent: "CLE", label: "Bulls–Cavs" }],
  DET: [{ opponent: "CHI", label: "Bulls–Pistons" }],
  NYK: [{ opponent: "MIA", label: "Knicks–Heat" }, { opponent: "BKN", label: "Battle of New York" }],
  BKN: [{ opponent: "NYK", label: "Battle of New York" }],
  GSW: [{ opponent: "CLE", label: "Warriors–Cavs Finals era" }, { opponent: "LAL", label: "Battle of California" }],
  CLE: [{ opponent: "GSW", label: "Warriors–Cavs Finals era" }],
  SAS: [{ opponent: "OKC", label: "Spurs–Thunder" }, { opponent: "MIA", label: "Spurs–Heat Finals" }],
  OKC: [{ opponent: "SAS", label: "Spurs–Thunder" }],
  PHX: [{ opponent: "SAS", label: "Suns–Spurs" }],
  LAC: [{ opponent: "LAL", label: "Battle of LA" }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function playerKey(name) {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return (parts[parts.length - 1] ?? name).toLowerCase().replace(/[^a-z]/g, "");
}

function salaryTier(salary) {
  if (salary >= 55) return "max";
  if (salary >= 40) return "star";
  if (salary >= 25) return "role";
  if (salary >= 15) return "value";
  return "flier";
}

// Find keys that already have the new fields in either culture file
function loadUpdatedKeys() {
  const keys = new Set();
  for (const filePath of [CULTURE_PATH, REVIEW_PATH, UPDATE_PATH]) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    // If entry has formerTeam field, it's already updated
    const entryBlocks = content.split(/\n  [a-z]+: \{/);
    for (const block of entryBlocks) {
      if (block.includes("formerTeam:")) {
        const keyMatch = content.match(new RegExp(`  ([a-z]+): \\{[^}]*${block.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        // simpler: find all keys that appear before a formerTeam field
      }
    }
    // Simpler approach: find keys where the block contains formerTeam
    const matches = [...content.matchAll(/  ([a-z]+): \{([\s\S]*?)\n  \},/g)];
    for (const m of matches) {
      if (m[2].includes("formerTeam:")) keys.add(m[1]);
    }
  }
  return keys;
}

function loadAllKeys() {
  const keys = new Set();
  for (const filePath of [CULTURE_PATH, REVIEW_PATH]) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const m of content.matchAll(/^\s{2}([a-z]+):\s*\{/gm)) keys.add(m[1]);
  }
  return keys;
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a writer for ReplayMod, a fantasy basketball card game. You are adding new commentary fields to existing player entries.

Voice: opinionated, specific, knowledgeable basketball fan. Short punchy sentences. Dry humor. Real historical references. Never generic.

Field rules for the NEW fields only:
- formerTeam: 3-4 lines. Player performing vs a former team. Emotionally specific. Name the actual team. Reference the trade, departure, or beef if known.
- rivalry: 3-4 lines. Rivalry game context. Reference actual NBA history between these franchises. Why does this matchup matter?
- salaryUnder: 3-4 lines. Big contract, underperforming this hand. Reference the approximate deal value if known (e.g. "$200M max deal"). Dry and pointed.
- salaryOver: 2-3 lines. Outperforming their deal. Specific to this player's contract situation.

Max 90 chars per line. Never generic. Every line specific to this exact player.

Return ONLY a valid JSON array. No markdown. No code fences. No explanation.`;

// ── Generate batch ────────────────────────────────────────────────────────────
async function generateBatch(players) {
  const playerList = players.map(p => {
    const teamAbbr = p.teamAbbr ?? "?";
    const rivalries = RIVALRIES[teamAbbr]?.map(r => r.label).join(", ") ?? "none notable";
    return `- "${p.name}" | team: ${p.team ?? "?"} (${teamAbbr}) | salary: $${p.salary ?? "?"} | tier: ${salaryTier(p.salary ?? 0)} | rivalries: ${rivalries}`;
  }).join("\n");

  const prompt = `Add the 4 new commentary fields for these ${players.length} NBA players:
${playerList}

For formerTeam: use real knowledge of where this player previously played. Be specific about the team and what happened.
For rivalry: use the rivalry listed. Reference real franchise history.
For salaryUnder/salaryOver: reference the real contract value if you know it.

Return a JSON array, one object per player, with ONLY these fields:
{
  "key": "lastname_lowercase",
  "name": "Full Name",
  "formerTeam": [],
  "rivalry": [],
  "salaryUnder": [],
  "salaryOver": []
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

// ── Serialize patch to TypeScript ─────────────────────────────────────────────
function toPatchTypeScript(key, entry) {
  const arr = v => {
    if (!Array.isArray(v) || v.length === 0) return "[]";
    return `[\n${v.map(s => `      "${String(s).replace(/"/g, '\\"')}",`).join("\n")}\n    ]`;
  };
  return `  // PATCH for: ${key}
  // Add these fields to the existing ${key} entry in playerCulture.ts
  formerTeam: ${arr(entry.formerTeam)},
  rivalry: ${arr(entry.rivalry)},
  salaryUnder: ${arr(entry.salaryUnder)},
  salaryOver: ${arr(entry.salaryOver)},
  // ── end patch ──`;
}

// ── Resolve team abbreviation from players.json team name ────────────────────
const NBA_TEAM_TO_ABBR = {
  "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WSH",
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY env var not set.");
    process.exit(1);
  }
  if (!fs.existsSync(PLAYERS_PATH)) {
    console.error(`ERROR: players.json not found at:\n  ${PLAYERS_PATH}`);
    process.exit(1);
  }

  const allPlayers = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"));
  const allKeys     = loadAllKeys();
  const updatedKeys = loadUpdatedKeys();

  // Players that have a culture entry but are missing the new fields
  const needsUpdate = allPlayers
    .filter(p => {
      if (!p.name) return false;
      const key = playerKey(p.name);
      return allKeys.has(key) && !updatedKeys.has(key);
    })
    .map(p => ({
      ...p,
      key: playerKey(p.name),
      teamAbbr: NBA_TEAM_TO_ABBR[p.team ?? p.mlbTeam ?? ""] ?? "?",
    }))
    .slice(0, MAX_PLAYERS);

  console.log("\n── Basketball Culture Updater ───────────────────────");
  console.log(`  Total players in DB:    ${allKeys.size}`);
  console.log(`  Already updated:        ${updatedKeys.size}`);
  console.log(`  Need new fields:        ${needsUpdate.length}`);
  console.log(`  Est. time:              ~${Math.ceil(needsUpdate.length / BATCH_SIZE * (DELAY_MS / 1000 + 6))}s`);
  console.log(`  Output:                 basketball/src/utils/culture_update.ts`);
  console.log("─────────────────────────────────────────────────────\n");

  if (needsUpdate.length === 0) {
    console.log("Nothing to update — all entries already have the new fields.");
    return;
  }

  // Init update file
  if (!fs.existsSync(UPDATE_PATH)) {
    fs.writeFileSync(UPDATE_PATH,
      `/**\n * culture_update.ts — New commentary fields for existing basketball entries\n * For each player below: find their entry in playerCulture.ts and add these fields.\n * Generated: ${new Date().toISOString()}\n */\n\n`,
      "utf8"
    );
  }

  const failed = [];
  let updated = 0;

  for (let i = 0; i < needsUpdate.length; i += BATCH_SIZE) {
    const batch = needsUpdate.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsUpdate.length / BATCH_SIZE);
    const names = batch.map(p => p.name).join(", ");
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${names} ... `);

    try {
      const results = await generateBatch(batch);
      for (const result of results) {
        const key = result.key || playerKey(result.name);
        const playerData = batch.find(p => p.name === result.name);
        fs.appendFileSync(UPDATE_PATH,
          `// ${result.name} ($${playerData?.salary ?? "?"})\n${toPatchTypeScript(key, result)}\n\n`,
          "utf8"
        );
        updated++;
      }
      console.log(`✓ (${results.length} entries)`);
    } catch (err) {
      console.log(`✗ FAILED: ${err.message}`);
      batch.forEach(p => failed.push({ name: p.name, error: err.message }));
    }

    if (i + BATCH_SIZE < needsUpdate.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  if (failed.length > 0) {
    fs.writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2), "utf8");
  }

  console.log(`\n── Done ─────────────────────────────────────────────`);
  console.log(`  Updated:    ${updated} entries`);
  console.log(`  Failed:     ${failed.length}`);
  console.log(`  Review at:  basketball/src/utils/culture_update.ts`);
  if (failed.length > 0) console.log(`  Failures:   basketball/src/utils/culture_update_failed.json`);
  console.log("─────────────────────────────────────────────────────\n");
  console.log("Next: open culture_update.ts, find each player in playerCulture.ts,");
  console.log("and add the 4 new fields to their entry.\n");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });

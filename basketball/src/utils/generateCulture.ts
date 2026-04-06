/**
 * generateCulture.ts — Overnight culture database agent
 *
 * Reads players.json, finds who's missing from playerCulture.ts,
 * generates entries in batches via Claude API, writes a review file.
 *
 * Usage (run from repo root):
 *   npx tsx basketball/src/utils/generateCulture.ts
 *
 * Output:
 *   basketball/src/utils/culture_review.ts   ← paste-ready entries to review
 *   basketball/src/utils/culture_failed.json ← any players that errored
 *
 * Config:
 *   BATCH_SIZE      — players per API call (3 is safe, keeps quality high)
 *   DELAY_MS        — ms between batches (avoid rate limits)
 *   MAX_PLAYERS     — set to a number to limit run, or Infinity for all
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PLAYER_CULTURE } from "./playerCulture";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────
const BATCH_SIZE = 3;
const DELAY_MS = 2000;
const MAX_PLAYERS = Infinity; // set to e.g. 50 to do a partial run

const PLAYERS_PATH = path.join(process.cwd(), "basketball/public/data/players.json");
const REVIEW_PATH = path.join(__dirname, "culture_review.ts");
const FAILED_PATH = path.join(__dirname, "culture_failed.json");

// ── Salary tier from salary ──────────────────────────────────────────────────
function salaryTier(salary: number): string {
  if (salary >= 55) return "max";
  if (salary >= 40) return "star";
  if (salary >= 25) return "role";
  if (salary >= 15) return "value";
  return "flier";
}

// ── Already in database ──────────────────────────────────────────────────────
const existingKeys = new Set(Object.keys(PLAYER_CULTURE));

function playerKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return (parts[parts.length - 1] ?? name).toLowerCase().replace(/[^a-z]/g, "");
}

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are a writer for ReplayMod, a fantasy basketball card game. You write player culture entries used as commentary shown after each hand.

Voice: opinionated, specific, knowledgeable basketball fan. Short punchy sentences. Dry humor. Specific historical references when they exist. Never generic. Never corporate.

Rules:
- tier1: 2 lines. Simple direct fact or defining trait. For new users.
- tier2: 2 lines. Deeper lore a real fan knows.
- tier3: 1-2 lines. Niche or obscure. For veterans only.
- overperform: 2-3 lines. When player beats projection. Celebratory but specific.
- underperform: 2-3 lines. When player falls short. Honest, not cruel.
- onPace: 2 lines. Player hit their average. Acknowledges reliability.
- turnovers: 1-2 lines. Player had turnovers. Specific to their tendencies.
- defensive: 1-2 lines if they play defense, empty array [] if they don't.
- bigGame: 2-3 lines. Tease that this stat line might be a famous game.
- quietGame: 1-2 lines. Player had a quiet game.
- famousGameHint: 2-3 lines. Encourage looking up the box score.

Max 90 chars per line. Never use the word "lineup". Specific to THIS player only.
Salary tiers: max=$55+, star=$40-54, role=$25-39, value=$15-24, flier=under$15

Return ONLY a JSON array of objects, one per player. No markdown, no explanation.`;

// ── Generate one batch ───────────────────────────────────────────────────────
async function generateBatch(
  players: Array<{ name: string; salary: number }>
): Promise<Array<{ key: string; name: string; data: any }>> {
  const playerList = players
    .map((p) => `- "${p.name}" (salary: $${p.salary}, tier: ${salaryTier(p.salary)})`)
    .join("\n");

  const prompt = `Generate PlayerCulture entries for these ${players.length} NBA players:

${playerList}

Return a JSON array with one object per player. Each object:
{
  "key": "lastname_lowercase",
  "name": "Full Name",
  "nicknames": [],
  "knownFor": "one sentence",
  "salaryTier": "role",
  "tier1": [],
  "tier2": [],
  "tier3": [],
  "overperform": [],
  "underperform": [],
  "onPace": [],
  "turnovers": [],
  "defensive": [],
  "bigGame": [],
  "quietGame": [],
  "famousGameHint": [],
  "controversy": []
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
      max_tokens: 4000,
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

// ── Format one entry as TypeScript ───────────────────────────────────────────
function toTypeScript(key: string, entry: any): string {
  const fields = [
    "nicknames", "knownFor", "salaryTier",
    "tier1", "tier2", "tier3",
    "overperform", "underperform", "onPace",
    "turnovers", "defensive", "bigGame",
    "quietGame", "famousGameHint", "controversy",
  ];

  const lines: string[] = [`  ${key}: {`];
  for (const field of fields) {
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
  lines.push(`  },`);
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set.");
    console.error("Run: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  // Load players
  if (!fs.existsSync(PLAYERS_PATH)) {
    console.error(`ERROR: players.json not found at ${PLAYERS_PATH}`);
    console.error("Run from the repo root: npx tsx basketball/src/utils/generateCulture.ts");
    process.exit(1);
  }

  const allPlayers: Array<{ name: string; salary: number; active?: boolean }> =
    JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"));

  // Filter: active, has salary, not already in DB
  const missing = allPlayers
    .filter((p) => p.active !== false && p.salary > 0)
    .filter((p) => !existingKeys.has(playerKey(p.name)))
    .slice(0, MAX_PLAYERS === Infinity ? undefined : MAX_PLAYERS);

  console.log(`\n── ReplayMod Culture Generator ─────────────────────`);
  console.log(`  Total players in DB:    ${allPlayers.length}`);
  console.log(`  Already have culture:   ${existingKeys.size}`);
  console.log(`  Need entries:           ${missing.length}`);
  console.log(`  Batch size:             ${BATCH_SIZE}`);
  console.log(`  Estimated time:         ~${Math.ceil(missing.length / BATCH_SIZE * (DELAY_MS / 1000 + 8))}s`);
  console.log(`────────────────────────────────────────────────────\n`);

  if (missing.length === 0) {
    console.log("Nothing to generate — all players already have culture entries.");
    return;
  }

  // Clear output files
  fs.writeFileSync(
    REVIEW_PATH,
    `/**\n * culture_review.ts — Generated entries awaiting approval\n * Review each entry, edit as needed, then paste into playerCulture.ts\n * Generated: ${new Date().toISOString()}\n */\n\n// ── PASTE THESE INTO PLAYER_CULTURE in playerCulture.ts ──\n\n`,
    "utf8"
  );

  const failed: Array<{ name: string; error: string }> = [];
  let generated = 0;
  let batchNum = 0;

  // Process in batches
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    batchNum++;

    const names = batch.map((p) => p.name).join(", ");
    process.stdout.write(
      `  Batch ${batchNum}/${Math.ceil(missing.length / BATCH_SIZE)}: ${names} ... `
    );

    try {
      const results = await generateBatch(batch);

      for (const result of results) {
        const key = result.key || playerKey(result.name);
        const ts = toTypeScript(key, result);
        fs.appendFileSync(REVIEW_PATH, `// ${result.name} ($${batch.find(p => p.name === result.name)?.salary ?? "?"})\n${ts}\n\n`, "utf8");
        generated++;
      }

      console.log(`✓ (${results.length} entries)`);
    } catch (err: any) {
      console.log(`✗ FAILED: ${err.message}`);
      batch.forEach((p) => failed.push({ name: p.name, error: err.message }));
    }

    // Delay between batches
    if (i + BATCH_SIZE < missing.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // Write failed log
  if (failed.length > 0) {
    fs.writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2), "utf8");
  }

  console.log(`\n── Done ────────────────────────────────────────────`);
  console.log(`  Generated:  ${generated} entries`);
  console.log(`  Failed:     ${failed.length} entries`);
  console.log(`  Review at:  basketball/src/utils/culture_review.ts`);
  if (failed.length > 0) {
    console.log(`  Failed log: basketball/src/utils/culture_failed.json`);
  }
  console.log(`────────────────────────────────────────────────────\n`);
  console.log(`Next: open culture_review.ts, read through the entries,`);
  console.log(`edit anything that sounds off, then paste into playerCulture.ts.\n`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});

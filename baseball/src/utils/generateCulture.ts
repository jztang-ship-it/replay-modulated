/**
 * generateCulture.ts — Baseball culture database generator
 *
 * Reads players.json + game-logs.json, fetches player bios from Wikipedia,
 * and generates COMPLETE culture entries for all ORANGE and PURPLE tier
 * players using real game data + web-sourced cultural context.
 *
 * Usage (run from repo root):
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npx tsx baseball/src/utils/generateCulture.ts
 *
 * Output:
 *   baseball/src/utils/culture_review.ts   ← all entries
 *   baseball/src/utils/culture_failed.json ← any players that errored
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────
const BATCH_SIZE = 2;
const DELAY_MS = 3000;
const MAX_TOKENS = 8000;
const WIKI_DELAY_MS = 1200;

const PLAYERS_PATH = path.join(process.cwd(), "baseball/public/data/players.json");
const GAME_LOGS_PATH = path.join(process.cwd(), "baseball/public/data/game-logs.json");
const REVIEW_PATH = path.join(__dirname, "culture_review.ts");
const FAILED_PATH = path.join(__dirname, "culture_failed.json");

// ── Types ───────────────────────────────────────────────────────────────────
interface PlayerEntry {
  id: string;
  basePlayerId: string;
  season: string | number;
  name: string;
  team: string;
  position: string;
  salary: number;
  tier: string;
  active?: boolean;
}

interface GameLog {
  basePlayerId: string;
  playerId: string;
  date: string;
  season: number;
  opponent: string;
  stats: {
    h: number;
    doubles: number;
    triples: number;
    hr: number;
    r: number;
    rbi: number;
    bb: number;
    sb: number;
    pa: number;
    ip: number;
    k: number;
    er: number;
    w: number;
    qs: number;
  };
}

interface GameWithFP extends GameLog {
  fp: number;
}

// ── Salary tier from salary ──────────────────────────────────────────────────
function salaryTier(salary: number): string {
  if (salary >= 55) return "max";
  if (salary >= 40) return "star";
  if (salary >= 25) return "role";
  if (salary >= 15) return "value";
  return "flier";
}

function playerKey(name: string): string {
  const stripped = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const parts = stripped.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return (parts[parts.length - 1] ?? name).toLowerCase().replace(/[^a-z]/g, "");
}

// ── Compute FP (baseball) ──────────────────────────────────────────────────
function computeFP(s: GameLog["stats"]): number {
  return (
    s.h * 12 +
    s.doubles * 5 +
    s.triples * 10 +
    s.hr * 20 +
    s.r * 9 +
    s.rbi * 9 +
    s.bb * 6 +
    s.sb * 12 +
    s.ip * 3 +
    s.k * 4 +
    s.er * -3 +
    s.w * 6 +
    s.qs * 8
  );
}

function isPitcherLogs(logs: GameLog[]): boolean {
  return logs.some((l) => l.stats.ip > 0 && l.stats.pa === 0);
}

// ── Build game data summary for a player ────────────────────────────────────
function buildGameDataSummary(logs: GameLog[]): {
  top10: GameWithFP[];
  seasonHighHR: GameWithFP | null;
  seasonHighK: GameWithFP | null;
  multiHRGames: GameWithFP[];
  qualityStarts: GameWithFP[];
} {
  const withFP: GameWithFP[] = logs.map((g) => ({
    ...g,
    fp: Math.round(computeFP(g.stats) * 10) / 10,
  }));

  const sorted = [...withFP].sort((a, b) => b.fp - a.fp);
  const top10 = sorted.slice(0, 10);

  const seasonHighHR = withFP.length
    ? withFP.reduce((a, b) => (a.stats.hr > b.stats.hr ? a : b))
    : null;

  const seasonHighK = withFP.length
    ? withFP.reduce((a, b) => (a.stats.k > b.stats.k ? a : b))
    : null;

  const multiHRGames = withFP.filter((g) => g.stats.hr >= 2);
  const qualityStarts = withFP.filter((g) => g.stats.qs > 0);

  return { top10, seasonHighHR, seasonHighK, multiHRGames, qualityStarts };
}

function formatGameLine(g: GameWithFP, pitcher: boolean): string {
  const s = g.stats;
  if (pitcher) {
    return `${g.date} vs ${g.opponent}: ${s.ip}IP/${s.k}K/${s.er}ER${s.w ? " W" : ""}${s.qs ? " QS" : ""} = ${g.fp}FP`;
  }
  return `${g.date} vs ${g.opponent}: ${s.h}H/${s.hr}HR/${s.r}R/${s.rbi}RBI/${s.bb}BB/${s.sb}SB = ${g.fp}FP`;
}

// ── Wikipedia fetcher ──────────────────────────────────────────────────────
async function fetchWikipediaBio(name: string): Promise<string> {
  const wikiName = name.replace(/ /g, "_");
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = await res.json();
    return data.extract ?? "";
  } catch {
    return "";
  }
}

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM = `You are a writer for ReplayMod, a fantasy baseball card game. You write player culture entries used as commentary shown after each hand.

Voice: opinionated, specific, knowledgeable baseball fan. Short punchy sentences. Dry humor. Specific historical references when they exist. Never generic. Never corporate.

Rules:
- tier1: 2 lines. Simple direct fact or defining trait. For new users.
- tier2: 2 lines. Deeper lore a real fan knows.
- tier3: 1-2 lines. Niche or obscure. For veterans only.
- overperform: 2-3 lines. When player beats projection. Celebratory but specific.
- underperform: 2-3 lines. When player falls short. Honest, not cruel.
- onPace: 2 lines. Player hit their average. Acknowledges reliability.
- bigGame: 2-3 lines. Ground these in the REAL stat lines provided. Tease that this stat line might be a famous game.
- quietGame: 1-2 lines. Player had a quiet game.
- famousGameHint: 2-3 lines. Ground in REAL games from the data. Encourage looking up the box score.
- controversy: 1-2 lines. Something spicy about the player.
- opponentFlavor: Record<string, string> — short takes for 3-5 specific opponents.
- formerTeam: 1-2 lines about facing former teams. Specific to their actual history.
- rivalry: 1-2 lines about real player/team rivalries.
- milestones: 1-2 lines about career milestone references.
- streakLines: 2-3 lines. Hot/cold streak context. Can reference real streaks from the data.
- signatureGames: 3-5 objects with { date, opponent, fp, line }. Use the ACTUAL dates, opponents, and FP from the top games provided. The "line" field is a short teaser about why the game matters.
- salaryNarrative: 2-3 lines. Opinionated value takes using the actual salary. Not generic.
- salaryUnder: 2-3 lines. When the player is outperforming their salary.
- salaryOver: 1-2 lines. When the player might be overpaid.
- teamContext: 1-2 lines. How they landed on their current team + teammate chemistry.
- draftAndPath: 1-2 lines. Draft story and career trajectory.
- defensive: 1-2 lines. Defensive reputation (Gold Glove, arm strength, range, etc).
- parkBoost: 1-2 lines. When their home park helps (Coors, Yankee Stadium short porch, etc).
- parkSuppressed: 1-2 lines. When their home park suppresses stats.

Max 90 chars per line. Never use the word "lineup". Specific to THIS player only.
Salary tiers: max=$55+, star=$40-54, role=$25-39, value=$15-24, flier=under$15

For signatureGames, use the exact dates and opponents from the game data I provide. Write a short teaser line explaining why each game matters.
For salaryNarrative, write opinionated value takes, not generic. Reference the actual salary number.
For teamContext, reference actual trade/draft history.

Return ONLY a JSON array of objects, one per player. No markdown, no explanation.`;

// ── Generate one batch ───────────────────────────────────────────────────────
async function generateBatch(
  players: Array<{
    name: string;
    salary: number;
    team: string;
    tier: string;
    gameDataSummary: string;
    teammates: string[];
    wikiBio: string;
  }>
): Promise<Array<{ key: string; name: string; [k: string]: any }>> {
  const playerSections = players
    .map((p) => {
      let section = `── ${p.name} (${p.team}, salary: $${p.salary}, tier: ${p.tier}, salaryTier: ${salaryTier(p.salary)})`;
      if (p.teammates.length > 0) {
        section += `\nORANGE/PURPLE teammates on ${p.team}: ${p.teammates.join(", ")}`;
      }
      if (p.wikiBio) {
        section += `\n\nBACKGROUND:\n${p.wikiBio}`;
      }
      section += `\n\nGAME DATA:\n${p.gameDataSummary}`;
      return section;
    })
    .join("\n\n─────────────────────────────────────────\n\n");

  const prompt = `Generate PlayerCulture entries for these ${players.length} MLB players. Use their REAL game data to ground bigGame, famousGameHint, signatureGames, and streakLines. Use the BACKGROUND info for controversy, draftAndPath, teamContext, milestones, and defensive.

${playerSections}

Return a JSON array with one object per player. Each object:
{
  "key": "lastname_lowercase",
  "name": "Full Name",
  "nicknames": [],
  "knownFor": "one sentence",
  "salaryTier": "max|star|role|value|flier",
  "tier1": [],
  "tier2": [],
  "tier3": [],
  "overperform": [],
  "underperform": [],
  "onPace": [],
  "bigGame": [],
  "quietGame": [],
  "famousGameHint": [],
  "controversy": [],
  "opponentFlavor": {},
  "formerTeam": [],
  "rivalry": [],
  "milestones": [],
  "streakLines": [],
  "signatureGames": [{ "date": "YYYY-MM-DD", "opponent": "XXX", "fp": 0, "line": "" }],
  "salaryNarrative": [],
  "salaryUnder": [],
  "salaryOver": [],
  "teamContext": [],
  "draftAndPath": [],
  "defensive": [],
  "parkBoost": [],
  "parkSuppressed": []
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

// ── Format one entry as TypeScript ───────────────────────────────────────────
function toTypeScript(key: string, entry: any): string {
  const simpleFields = [
    "nicknames", "knownFor", "salaryTier",
    "tier1", "tier2", "tier3",
    "overperform", "underperform", "onPace",
    "bigGame", "quietGame", "famousGameHint",
    "controversy", "formerTeam", "rivalry",
    "milestones", "streakLines",
    "salaryNarrative", "salaryUnder", "salaryOver",
    "teamContext", "draftAndPath", "defensive",
    "parkBoost", "parkSuppressed",
  ];

  const lines: string[] = [`  ${key}: {`];

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

  // opponentFlavor (Record<string, string>)
  const opp = entry.opponentFlavor;
  if (opp && typeof opp === "object" && !Array.isArray(opp)) {
    const entries = Object.entries(opp)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(", ");
    lines.push(`    opponentFlavor: { ${entries} },`);
  } else {
    lines.push(`    opponentFlavor: {},`);
  }

  // signatureGames (array of objects)
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

  if (!fs.existsSync(PLAYERS_PATH)) {
    console.error(`ERROR: players.json not found at ${PLAYERS_PATH}`);
    process.exit(1);
  }

  const allPlayers: PlayerEntry[] = JSON.parse(fs.readFileSync(PLAYERS_PATH, "utf8"));

  if (!fs.existsSync(GAME_LOGS_PATH)) {
    console.error(`ERROR: game-logs.json not found at ${GAME_LOGS_PATH}`);
    process.exit(1);
  }
  const allGameLogs: GameLog[] = JSON.parse(fs.readFileSync(GAME_LOGS_PATH, "utf8"));

  // Filter to ORANGE and PURPLE tier players
  const targetPlayers = allPlayers.filter(
    (p) => p.tier === "ORANGE" || p.tier === "PURPLE"
  );

  // Build teammate map (ORANGE/PURPLE players grouped by team)
  const teamMap = new Map<string, string[]>();
  for (const p of targetPlayers) {
    if (!teamMap.has(p.team)) teamMap.set(p.team, []);
    teamMap.get(p.team)!.push(p.name);
  }

  // Index game logs by basePlayerId
  const logsByPlayer = new Map<string, GameLog[]>();
  for (const log of allGameLogs) {
    const key = String(log.basePlayerId);
    if (!logsByPlayer.has(key)) logsByPlayer.set(key, []);
    logsByPlayer.get(key)!.push(log);
  }

  // Fetch Wikipedia bios for all players
  console.log(`\n── Fetching Wikipedia bios ─────────────────────────`);
  const wikiBios = new Map<string, string>();
  for (const p of targetPlayers) {
    process.stdout.write(`  ${p.name}... `);
    const bio = await fetchWikipediaBio(p.name);
    wikiBios.set(p.name, bio);
    console.log(bio ? `✓ (${bio.length} chars)` : "✗ (not found)");
    await new Promise((r) => setTimeout(r, WIKI_DELAY_MS));
  }

  // Build batch input with game data
  const batchInput = targetPlayers.map((p) => {
    const playerId = String(p.basePlayerId || p.id.split("_")[0]);
    const logs = logsByPlayer.get(playerId) ?? [];
    const pitcher = isPitcherLogs(logs);
    const summary = buildGameDataSummary(logs);

    let gameDataSummary = "";

    gameDataSummary += "TOP 10 GAMES BY FP:\n";
    if (summary.top10.length > 0) {
      summary.top10.forEach((g, i) => {
        gameDataSummary += `  ${i + 1}. ${formatGameLine(g, pitcher)}\n`;
      });
    } else {
      gameDataSummary += "  (no game logs available)\n";
    }

    if (summary.seasonHighHR?.stats.hr) {
      gameDataSummary += `\nSEASON HIGH HR: ${formatGameLine(summary.seasonHighHR, pitcher)}\n`;
    }
    if (summary.seasonHighK?.stats.k) {
      gameDataSummary += `SEASON HIGH K: ${formatGameLine(summary.seasonHighK, pitcher)}\n`;
    }

    if (summary.multiHRGames.length > 0) {
      gameDataSummary += `\nMULTI-HR GAMES (${summary.multiHRGames.length}):\n`;
      summary.multiHRGames.slice(0, 5).forEach((g) => {
        gameDataSummary += `  ${formatGameLine(g, pitcher)}\n`;
      });
    }

    if (summary.qualityStarts.length > 0) {
      gameDataSummary += `\nQUALITY STARTS (${summary.qualityStarts.length}):\n`;
      summary.qualityStarts.slice(0, 5).forEach((g) => {
        gameDataSummary += `  ${formatGameLine(g, pitcher)}\n`;
      });
    }

    const teammates = (teamMap.get(p.team) ?? []).filter((n) => n !== p.name);

    return {
      name: p.name,
      salary: p.salary,
      team: p.team,
      tier: p.tier,
      gameDataSummary,
      teammates,
      wikiBio: wikiBios.get(p.name) ?? "",
    };
  });

  console.log(`\n── ReplayMod Baseball Culture Generator ────────────`);
  console.log(`  Target players:         ${batchInput.length} (ORANGE + PURPLE)`);
  console.log(`  Batch size:             ${BATCH_SIZE}`);
  console.log(`  Max tokens:             ${MAX_TOKENS}`);
  console.log(`  Delay between batches:  ${DELAY_MS}ms`);
  console.log(`  Estimated batches:      ${Math.ceil(batchInput.length / BATCH_SIZE)}`);
  console.log(`────────────────────────────────────────────────────\n`);

  // Clear output file
  fs.writeFileSync(
    REVIEW_PATH,
    `/**\n * culture_review.ts — Generated culture entries for all ORANGE + PURPLE tier players\n * Generated: ${new Date().toISOString()}\n * Total target players: ${batchInput.length}\n *\n * Review each entry, then merge into playerCulture.ts\n */\n\n// ── GENERATED ENTRIES ──\n\n`,
    "utf8"
  );

  const failed: Array<{ name: string; error: string }> = [];
  let generated = 0;
  let batchNum = 0;

  for (let i = 0; i < batchInput.length; i += BATCH_SIZE) {
    const batch = batchInput.slice(i, i + BATCH_SIZE);
    batchNum++;

    const names = batch.map((p) => p.name).join(", ");
    process.stdout.write(
      `  Batch ${batchNum}/${Math.ceil(batchInput.length / BATCH_SIZE)}: ${names} ... `
    );

    try {
      const results = await generateBatch(batch);

      for (const result of results) {
        const key = result.key || playerKey(result.name);
        const ts = toTypeScript(key, result);
        const matchPlayer = batch.find((p) =>
          p.name.toLowerCase().includes(result.name?.toLowerCase()?.split(" ").pop() ?? "")
        );
        fs.appendFileSync(
          REVIEW_PATH,
          `// ${result.name} (${matchPlayer?.team ?? "?"}, $${matchPlayer?.salary ?? "?"}, ${matchPlayer?.tier ?? "?"})\n${ts}\n\n`,
          "utf8"
        );
        generated++;
      }

      console.log(`✓ (${results.length} entries)`);
    } catch (err: any) {
      console.log(`✗ FAILED: ${err.message}`);
      batch.forEach((p) => failed.push({ name: p.name, error: err.message }));
    }

    if (i + BATCH_SIZE < batchInput.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (failed.length > 0) {
    fs.writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2), "utf8");
  }

  console.log(`\n── Done ────────────────────────────────────────────`);
  console.log(`  Generated:  ${generated} entries`);
  console.log(`  Failed:     ${failed.length} entries`);
  console.log(`  Review at:  baseball/src/utils/culture_review.ts`);
  if (failed.length > 0) {
    console.log(`  Failed log: baseball/src/utils/culture_failed.json`);
  }
  console.log(`────────────────────────────────────────────────────\n`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});

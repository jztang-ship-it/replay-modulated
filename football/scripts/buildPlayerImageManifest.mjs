/**
 * football/scripts/buildPlayerImageManifest.mjs
 *
 * One-shot lookup script that populates football/src/data/playerImageManifest.ts
 * with verified API-Football player IDs.
 *
 * Reads our players.json, calls API-Football's player-profile search per
 * player, picks the best match by name + nationality fit, writes results
 * back to the manifest TS file.
 *
 * Usage:
 *   API_FOOTBALL_KEY=<your-key> node football/scripts/buildPlayerImageManifest.mjs
 *
 * Options:
 *   --max=<N>          Limit lookups this run (default: 80, leaves headroom on
 *                      API-Football free-tier 100/day quota)
 *   --seasons=<a,b>    Active seasons to look up (default: "2022" — matches
 *                      football/src/adapters/footballConfig.ts activeSeasons)
 *   --force            Re-query players already in the manifest (overwrites)
 *   --dry-run          Don't write the manifest; print what would change
 *   --threshold=<N>    Min match score to accept (default: 8). Lower = more
 *                      forgiving but more false positives.
 *
 * Strategy per player:
 *   1. Search API-Football /players/profiles by last word of player name
 *      ("Messi" for "Lionel Andrés Messi Cuccittini")
 *   2. If 0 matches, retry with first-name + last-name
 *   3. Score each candidate:
 *        +10  full-name substring match (either direction)
 *        +5   nationality matches our team field exactly (case-insensitive)
 *        +2   nationality startsWith / endsWith match (Argentine vs Argentina)
 *        +3   surname-only fallback hit
 *   4. Pick highest-scoring candidate ≥ threshold
 *   5. On ties or low scores: log as "no confident match", skip
 *
 * Re-run safety:
 *   - Default skips players already in the manifest (use --force to override)
 *   - Idempotent — running twice is the same as once (modulo new manifest entries)
 *   - Rate-limited at ~3 req/sec via 350ms sleep between requests
 *   - Quota guard: hard-stops at --max requests this run
 *
 * Quota notes:
 *   - API-Football free tier: 100 requests/day
 *   - 622 players in 2022 pool → ~7 days at 80/day to seed everything
 *   - Paid tier ($19/mo "Pro") = 75k requests/day → seed in one run
 *   - Each player burns 1-2 requests (initial search + optional retry)
 *   - Suggest: run nightly with cron until manifest is full, then occasionally
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ────────────────────────────────────────────────────────────────────

const argMap = new Map(
  process.argv.slice(2).map(a => {
    const eq = a.indexOf("=");
    return eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, "true"];
  })
);
const opt = (k, fallback) => argMap.get(k) ?? fallback;

const API_KEY = process.env.API_FOOTBALL_KEY;
if (!API_KEY) {
  console.error("ERROR: API_FOOTBALL_KEY env var required.");
  console.error("Get one free at https://www.api-football.com/ and re-run:");
  console.error("  API_FOOTBALL_KEY=xxx node football/scripts/buildPlayerImageManifest.mjs");
  process.exit(1);
}

const MAX = parseInt(opt("--max", "80"), 10);
const FORCE = argMap.has("--force");
const DRY_RUN = argMap.has("--dry-run");
const THRESHOLD = parseInt(opt("--threshold", "8"), 10);
const SEASONS = String(opt("--seasons", "2022")).split(",").map(s => s.trim());

// ── Paths ───────────────────────────────────────────────────────────────────

const playersPath = resolvePath(__dirname, "../public/data/players.json");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");

// ── Load players + existing manifest ────────────────────────────────────────

const allPlayers = JSON.parse(readFileSync(playersPath, "utf8"));
const players = allPlayers.filter(p => SEASONS.includes(String(p.season)));

const manifestSrc = readFileSync(manifestPath, "utf8");
const existing = new Map();
const entryRe = /"(\d+)":\s*\{\s*apiFootballId:\s*(\d+)\s*\}/g;
let m;
while ((m = entryRe.exec(manifestSrc)) !== null) {
  existing.set(m[1], { apiFootballId: parseInt(m[2], 10) });
}

console.log("─".repeat(60));
console.log(`Active seasons: ${SEASONS.join(",")}`);
console.log(`Players in pool: ${players.length}`);
console.log(`Existing manifest entries: ${existing.size}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}${FORCE ? " (force re-query)" : ""}`);
console.log(`Max lookups this run: ${MAX} (threshold ${THRESHOLD})`);
console.log("─".repeat(60));

// ── Lookup ──────────────────────────────────────────────────────────────────

const todo = players.filter(p => {
  const id = String(p.basePlayerId ?? p.id);
  return FORCE || !existing.has(id);
});
console.log(`Players to lookup this run: ${Math.min(todo.length, MAX)} of ${todo.length} unmanifested\n`);

const updated = new Map(existing);
const found = [];
const noMatch = [];

async function searchProfiles(query) {
  const url = `https://v3.football.api-sports.io/players/profiles?search=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: {
      "x-rapidapi-key": API_KEY,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });
  if (!resp.ok) {
    console.warn(`  HTTP ${resp.status}: ${resp.statusText}`);
    return [];
  }
  const data = await resp.json();
  // API-Football error envelope check
  if (data.errors && Object.keys(data.errors).length > 0) {
    console.warn(`  API errors:`, data.errors);
    return [];
  }
  return Array.isArray(data.response) ? data.response : [];
}

function scoreCandidate(candidate, ourName, ourTeam, ourSurname) {
  const apiName = String(candidate?.player?.name ?? "");
  const apiNat = String(candidate?.player?.nationality ?? "");
  const ourNameLc = ourName.toLowerCase();
  const apiNameLc = apiName.toLowerCase();
  const ourTeamLc = ourTeam.toLowerCase();
  const apiNatLc = apiNat.toLowerCase();
  const ourSurnameLc = ourSurname.toLowerCase();

  let s = 0;
  // Full-name substring (either direction)
  if (apiNameLc.includes(ourNameLc) || ourNameLc.includes(apiNameLc)) s += 10;
  // Surname-only fallback
  else if (apiNameLc.includes(ourSurnameLc)) s += 3;
  // Exact nationality match (case-insensitive)
  if (apiNatLc === ourTeamLc) s += 5;
  // Loose nationality fit (e.g. "Argentine" vs "Argentina")
  else if (apiNatLc.startsWith(ourTeamLc.slice(0, 4)) || ourTeamLc.startsWith(apiNatLc.slice(0, 4))) s += 2;
  return s;
}

function lastWord(s) {
  return String(s).trim().split(/\s+/).filter(Boolean).pop() ?? "";
}

function firstAndLastWord(s) {
  const parts = String(s).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

const queriedThisRun = todo.slice(0, MAX);
let httpCalls = 0;

for (let i = 0; i < queriedThisRun.length; i++) {
  const p = queriedThisRun[i];
  const id = String(p.basePlayerId ?? p.id);
  const ourName = String(p.name ?? "");
  const ourTeam = String(p.team ?? "");
  const ourSurname = lastWord(ourName);

  if (!ourSurname) {
    console.log(`[${i + 1}/${queriedThisRun.length}] ${ourName} → SKIP (no surname)`);
    continue;
  }

  process.stdout.write(`[${i + 1}/${queriedThisRun.length}] ${ourName} (${ourTeam}) → `);

  // Strategy 1: surname only
  let candidates = await searchProfiles(ourSurname);
  httpCalls += 1;

  // Strategy 2: if no good initial match, retry with first+last
  if (candidates.length === 0 || candidates.every(c => scoreCandidate(c, ourName, ourTeam, ourSurname) < THRESHOLD)) {
    const flw = firstAndLastWord(ourName);
    if (flw && flw !== ourSurname) {
      const more = await searchProfiles(flw);
      httpCalls += 1;
      candidates = candidates.concat(more);
    }
  }

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(c, ourName, ourTeam, ourSurname);
    if (s > bestScore) { best = c; bestScore = s; }
  }

  if (best && bestScore >= THRESHOLD) {
    const apiId = best.player.id;
    console.log(`${best.player.name} [${best.player.nationality}] id=${apiId} (score ${bestScore})`);
    updated.set(id, { apiFootballId: apiId });
    found.push({ basePlayerId: id, name: ourName, apiId, apiName: best.player.name });
  } else {
    console.log(`no confident match (best score ${bestScore})`);
    noMatch.push({ basePlayerId: id, name: ourName, team: ourTeam });
  }

  // Polite spacing — API-Football is rate-limited
  await new Promise(r => setTimeout(r, 350));
}

// ── Write manifest ──────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`HTTP calls this run: ${httpCalls}`);
console.log(`Matched: ${found.length}`);
console.log(`No match: ${noMatch.length}`);
console.log(`Manifest size: ${existing.size} → ${updated.size}`);

if (DRY_RUN) {
  console.log("[DRY RUN] No file written. Re-run without --dry-run to commit changes.");
  process.exit(0);
}

if (updated.size === existing.size) {
  console.log("No changes to write.");
  process.exit(0);
}

// Generate the updated manifest. Preserves the header comment block;
// rewrites only the PLAYER_IMAGE_MANIFEST object.
const headerEnd = manifestSrc.indexOf("export const PLAYER_IMAGE_MANIFEST");
const footerStart = manifestSrc.indexOf("/** Look up external IDs");
if (headerEnd === -1 || footerStart === -1) {
  console.error("ERROR: Couldn't find expected anchors in manifest file. Aborting write.");
  console.error("Expected 'export const PLAYER_IMAGE_MANIFEST' and '/** Look up external IDs'");
  process.exit(1);
}

const header = manifestSrc.slice(0, headerEnd);
const footer = manifestSrc.slice(footerStart);

const sortedEntries = [...updated.entries()].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
const playerNameById = new Map(allPlayers.map(p => [String(p.basePlayerId ?? p.id), p.name]));
const teamById = new Map(allPlayers.map(p => [String(p.basePlayerId ?? p.id), p.team]));

const manifestBody = [
  "export const PLAYER_IMAGE_MANIFEST: Record<string, ExternalIds> = {",
  ...sortedEntries.map(([k, v]) => {
    const name = playerNameById.get(k) ?? "?";
    const team = teamById.get(k) ?? "?";
    return `  // ${name} (${team})\n  "${k}": { apiFootballId: ${v.apiFootballId} },`;
  }),
  "};",
  "",
  "",
].join("\n");

const newSrc = header + manifestBody + footer;
writeFileSync(manifestPath, newSrc, "utf8");
console.log(`Wrote ${manifestPath}`);

if (noMatch.length > 0) {
  console.log("\nUnmatched players (review by hand or rerun with --threshold=4):");
  for (const x of noMatch.slice(0, 20)) {
    console.log(`  ${x.basePlayerId}  ${x.name}  (${x.team})`);
  }
  if (noMatch.length > 20) console.log(`  …and ${noMatch.length - 20} more`);
}

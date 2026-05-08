/**
 * splitIntoPerSeasonFiles.mjs
 *
 * Splits the monolithic basketball data files into per-season layout:
 *
 *   basketball/public/data/seasons/{seasonKey}/players.json
 *   basketball/public/data/seasons/{seasonKey}/gamelogs.json
 *
 * Where seasonKey is 4-digit numeric ("2324", "2425").
 *
 * Why this layout exists:
 *   - The runtime model is "one season per day" — RNG picks a season at the
 *     start of each UTC day, the slate is built from that season only. So the
 *     client only needs that season's data, not all of it.
 *   - Per-season files = ~100 KB players + ~9 MB gamelogs (one season).
 *     Mobile users download today's season once per day, HTTP-cached
 *     thereafter. Acceptable.
 *   - Beyond ~5 seasons the monolithic 18 MB game-logs.json wouldn't ship —
 *     this layout is the storage architecture that lets the substrate scale
 *     to ~40 seasons.
 *
 * Inputs (read, not modified):
 *   - basketball/public/data/players.json (multi-season; PR #71 has 2324+2425)
 *   - basketball/public/data/game-logs.json (multi-season; has 2324+2425 logs)
 *
 * Outputs:
 *   - basketball/public/data/seasons/{key}/players.json
 *   - basketball/public/data/seasons/{key}/gamelogs.json
 *   - basketball/public/data/seasons/_manifest.json (list of available seasons)
 *
 * Idempotent: re-running overwrites the season files with current input data.
 *
 * Usage:
 *   node basketball/scripts/splitIntoPerSeasonFiles.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "public", "data");
const SEASONS_DIR = join(DATA_DIR, "seasons");

const playersPath = join(DATA_DIR, "players.json");
const logsPath = join(DATA_DIR, "game-logs.json");

console.log("📥 Loading source files...");
const allPlayers = JSON.parse(readFileSync(playersPath, "utf8"));
const allLogs = JSON.parse(readFileSync(logsPath, "utf8"));
console.log(`   players: ${allPlayers.length}`);
console.log(`   logs: ${allLogs.length}`);

// Group by season. Players use the `season` field directly; logs use `season`
// too. Both are 4-digit string keys (e.g. "2324", "2425").
const playersBySeason = new Map();
for (const p of allPlayers) {
  const s = String(p.season ?? "").trim();
  if (!s) continue;
  const arr = playersBySeason.get(s) ?? [];
  arr.push(p);
  playersBySeason.set(s, arr);
}

const logsBySeason = new Map();
for (const l of allLogs) {
  const s = String(l.season ?? "").trim();
  if (!s) continue;
  const arr = logsBySeason.get(s) ?? [];
  arr.push(l);
  logsBySeason.set(s, arr);
}

// Union of seasons present in either file.
const allSeasonKeys = new Set([...playersBySeason.keys(), ...logsBySeason.keys()]);
console.log(`\n🔍 Seasons found: ${[...allSeasonKeys].sort().join(", ")}`);

const manifest = { seasons: [], generatedAt: new Date().toISOString() };

for (const seasonKey of [...allSeasonKeys].sort()) {
  const seasonDir = join(SEASONS_DIR, seasonKey);
  mkdirSync(seasonDir, { recursive: true });

  const players = playersBySeason.get(seasonKey) ?? [];
  const logs = logsBySeason.get(seasonKey) ?? [];

  // Sort consistently — players by salary desc (matches existing convention),
  // logs by date asc (chronological readability).
  players.sort((a, b) => Number(b.salary ?? 0) - Number(a.salary ?? 0));
  logs.sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  writeFileSync(join(seasonDir, "players.json"), JSON.stringify(players, null, 2));
  writeFileSync(join(seasonDir, "gamelogs.json"), JSON.stringify(logs, null, 2));

  const playersBytes = readFileSync(join(seasonDir, "players.json")).length;
  const logsBytes = readFileSync(join(seasonDir, "gamelogs.json")).length;

  manifest.seasons.push({
    key: seasonKey,
    label: seasonLabel(seasonKey),
    playerCount: players.length,
    logCount: logs.length,
    playersBytes,
    logsBytes,
  });

  console.log(
    `   ${seasonKey} — ${players.length.toString().padStart(4)} players, ${logs.length.toString().padStart(6)} logs (${(playersBytes / 1024).toFixed(1)} KB + ${(logsBytes / 1024 / 1024).toFixed(2)} MB)`
  );
}

writeFileSync(join(SEASONS_DIR, "_manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\n✅ Wrote ${manifest.seasons.length} season(s) to ${SEASONS_DIR}`);
console.log(`   manifest: ${join(SEASONS_DIR, "_manifest.json")}`);

/**
 * Convert "2324" → "2023-24" for human-readable labeling. Two-digit pairs
 * in basketball season keys: first half of NBA season + second half. The
 * full year encoding handles the century rollover trivially (everything's
 * 1900s or 2000s in NBA history; handle pre-2000 if data goes that far).
 */
function seasonLabel(key) {
  const k = String(key).padStart(4, "0");
  const a = Number(k.slice(0, 2));
  const b = Number(k.slice(2, 4));
  // Heuristic: if the second pair < first pair, it's a century rollover.
  // 2324 → 23+24 → both in 2000s → "2023-24".
  // 9900 → 99+00 → rollover → "1999-00".
  // 7980 → 79+80 → both in 1900s → "1979-80".
  if (a >= 50 && b >= 50) return `19${k.slice(0, 2)}-${k.slice(2, 4)}`;
  if (a >= 50 && b < 50) return `19${k.slice(0, 2)}-${k.slice(2, 4)}`; // rollover (e.g. 9900)
  return `20${k.slice(0, 2)}-${k.slice(2, 4)}`;
}

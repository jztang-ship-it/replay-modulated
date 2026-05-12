/**
 * pruneMissingHeadshots.mjs
 *
 * Drops players from every per-season players.json (and their game logs)
 * whose headshot file is not present in the Supabase Storage bucket.
 *
 * Why: the runtime falls back to player initials when a headshot fails to
 * load, but a slate full of "JS" / "CS" placeholders reads as broken
 * rather than retro. Easier to just drop missing-headshot players.
 *
 * Strategy:
 *   1. Build the unique set of (basePlayerId | photoCode) across all 29
 *      season players.json files.
 *   2. HEAD-check the Supabase public URL for each (concurrency 20).
 *      Cache results so the script is resumable; 200 → keep, 404 → drop.
 *   3. For each season, drop players whose headshot 404'd, plus their game
 *      logs. Re-emit summary per season + grand total + dropped names.
 *
 * Usage:
 *   node basketball/scripts/pruneMissingHeadshots.mjs            # apply
 *   node basketball/scripts/pruneMissingHeadshots.mjs --dry-run  # preview
 *   node basketball/scripts/pruneMissingHeadshots.mjs --refresh  # re-check all (ignore cache)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");
const CACHE_PATH = join(__dirname, ".headshot-presence-cache.json");
const ENV_PATH = join(__dirname, "..", ".env.local");

// Read VITE_HEADSHOT_BASE_URL from basketball/.env.local
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
const env = Object.fromEntries(
  envText.split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
);
const HEADSHOT_BASE = process.env.VITE_HEADSHOT_BASE_URL ?? env.VITE_HEADSHOT_BASE_URL
  ?? "https://hnhrpwwznzokkfagfumb.supabase.co/storage/v1/object/public/headshots/nba";

const dryRun = process.argv.includes("--dry-run");
const refresh = process.argv.includes("--refresh");
const CONCURRENCY = 20;

// Load cache
let cache = {};
if (existsSync(CACHE_PATH) && !refresh) {
  try { cache = JSON.parse(readFileSync(CACHE_PATH, "utf8")); } catch { cache = {}; }
}

// Collect every photoCode we need to check
const seasonKeys = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

const codesToCheck = new Set();
for (const key of seasonKeys) {
  const playersPath = join(SEASONS_DIR, key, "players.json");
  if (!existsSync(playersPath)) continue;
  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  for (const p of players) {
    const code = String(p.photoCode ?? p.basePlayerId ?? "").trim();
    if (code) codesToCheck.add(code);
  }
}

const unknown = [...codesToCheck].filter(c => !(c in cache));
console.log(`📋 Total unique photoCodes: ${codesToCheck.size}`);
console.log(`💾 Cached: ${codesToCheck.size - unknown.length}`);
console.log(`🌐 To HEAD-check: ${unknown.length}\n`);

async function headOne(code) {
  const url = `${HEADSHOT_BASE}/${code}.png`;
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function pool(items, fn, concurrency, label) {
  let done = 0;
  const total = items.length;
  const queue = [...items];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      const ok = await fn(item);
      cache[item] = ok;
      done++;
      if (done % 50 === 0 || done === total) {
        process.stdout.write(`\r  ${label}: ${done}/${total}  `);
      }
    }
  });
  await Promise.all(workers);
  if (total > 0) process.stdout.write("\n");
}

if (unknown.length > 0) {
  await pool(unknown, headOne, CONCURRENCY, "HEAD");
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`💾 Cache saved → ${CACHE_PATH}\n`);
}

const have = new Set(Object.entries(cache).filter(([, ok]) => ok).map(([code]) => code));
console.log(`✅ ${have.size}/${codesToCheck.size} photoCodes have headshots\n`);

const summary = [];
let totalDropped = 0;
let totalLogsDropped = 0;
const droppedByName = new Map();

for (const key of seasonKeys) {
  const playersPath = join(SEASONS_DIR, key, "players.json");
  const logsPath = join(SEASONS_DIR, key, "gamelogs.json");
  if (!existsSync(playersPath)) continue;
  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  const drop = new Set();
  const kept = [];
  for (const p of players) {
    const code = String(p.photoCode ?? p.basePlayerId ?? "").trim();
    if (!code || !have.has(code)) {
      drop.add(String(p.basePlayerId ?? ""));
      droppedByName.set(p.name, (droppedByName.get(p.name) ?? 0) + 1);
    } else {
      kept.push(p);
    }
  }
  let logsDropped = 0;
  if (existsSync(logsPath)) {
    const logs = JSON.parse(readFileSync(logsPath, "utf8"));
    const keptLogs = logs.filter(l => !drop.has(String(l.basePlayerId ?? "")));
    logsDropped = logs.length - keptLogs.length;
    if (!dryRun && logsDropped > 0) {
      writeFileSync(logsPath, JSON.stringify(keptLogs, null, 2));
    }
  }
  if (!dryRun && drop.size > 0) {
    writeFileSync(playersPath, JSON.stringify(kept, null, 2));
  }
  summary.push({ key, before: players.length, after: kept.length, dropped: drop.size, logsDropped });
  totalDropped += drop.size;
  totalLogsDropped += logsDropped;
}

console.log(`${"season".padEnd(8)} ${"before".padStart(7)} ${"after".padStart(6)} ${"dropped".padStart(8)} ${"logs↓".padStart(7)}`);
console.log("-".repeat(45));
for (const s of summary) {
  console.log(`${s.key.padEnd(8)} ${String(s.before).padStart(7)} ${String(s.after).padStart(6)} ${String(s.dropped).padStart(8)} ${String(s.logsDropped).padStart(7)}`);
}
console.log("-".repeat(45));
console.log(`TOTAL                          ${String(totalDropped).padStart(8)} ${String(totalLogsDropped).padStart(7)}`);
console.log(`\n${dryRun ? "(dry-run — no files written)" : "✅ Files updated."}\n`);

if (droppedByName.size > 0 && droppedByName.size < 200) {
  console.log(`Dropped players (${droppedByName.size} unique):`);
  for (const [name, count] of [...droppedByName.entries()].sort()) {
    console.log(`  ${name}${count > 1 ? ` (×${count})` : ""}`);
  }
}

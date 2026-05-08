/**
 * downloadHeadshots.mjs
 *
 * Downloads NBA player headshots locally for offline use. Walks the
 * per-season directories (basketball/public/data/seasons/{key}/players.json)
 * and collects unique basePlayerIds across every season — so a single run
 * gets headshots for everyone the slate could ever surface.
 *
 * Skips IDs that are already downloaded (idempotent — safe to re-run after
 * adding new seasons).
 *
 * Sources tried in order:
 *   1. ESPN's CDN (most permissive, doesn't block automation)
 *   2. NBA CDN (fallback)
 *
 * Run from anywhere — paths resolve relative to this script:
 *   node basketball/scripts/downloadHeadshots.mjs
 *
 * Output:
 *   basketball/public/headshots/{basePlayerId}.png
 *   basketball/public/headshots/safe-headshot-map.json (lookup index)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../public/data");
const SEASONS_DIR = join(DATA_DIR, "seasons");
const HEADSHOT_DIR = join(__dirname, "../public/headshots");

const SLEEP_MS = 150; // be polite to the CDN
const sleep = ms => new Promise(r => setTimeout(r, ms));

function espnUrl(nbaId) {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${nbaId}.png&w=260&h=190&scale=crop`;
}

function nbaUrl(nbaId) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`;
}

async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 ReplayMod/1.0" } });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    // Reject tiny images (< 2KB = probably a placeholder/error image).
    if (buf.byteLength < 2000) return false;
    writeFileSync(destPath, Buffer.from(buf));
    return true;
  } catch {
    return false;
  }
}

/** Walk seasons/*\/players.json and aggregate { id → [seasons player appears in] }. */
function collectPlayersFromSeasons() {
  const idToSeasons = new Map();
  const idToName = new Map();

  if (!existsSync(SEASONS_DIR)) {
    console.error(`❌ ${SEASONS_DIR} not found. Run extractor first.`);
    process.exit(1);
  }

  const entries = readdirSync(SEASONS_DIR);
  for (const entry of entries) {
    if (entry.startsWith("_") || entry.startsWith(".")) continue;
    const seasonDir = join(SEASONS_DIR, entry);
    if (!statSync(seasonDir).isDirectory()) continue;
    const playersPath = join(seasonDir, "players.json");
    if (!existsSync(playersPath)) continue;

    let players;
    try {
      players = JSON.parse(readFileSync(playersPath, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(players)) continue;

    for (const p of players) {
      const id = String(p.basePlayerId ?? "").trim();
      if (!id) continue;
      const list = idToSeasons.get(id) ?? [];
      list.push(entry);
      idToSeasons.set(id, list);
      if (!idToName.has(id)) idToName.set(id, String(p.name ?? ""));
    }
  }

  return { idToSeasons, idToName };
}

async function main() {
  mkdirSync(HEADSHOT_DIR, { recursive: true });

  const { idToSeasons, idToName } = collectPlayersFromSeasons();
  const ids = [...idToSeasons.keys()].sort();

  console.log(`📸 Headshots — ${ids.length} unique players across ${new Set([...idToSeasons.values()].flat()).size} seasons`);
  console.log(`   Saving to: ${HEADSHOT_DIR}\n`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const safeMap = {}; // basePlayerId|season → filename, plus basePlayerId → filename

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const destPath = join(HEADSHOT_DIR, `${id}.png`);
    const seasons = idToSeasons.get(id) ?? [];
    const label = `${id} (${idToName.get(id) ?? "?"})`;

    if (existsSync(destPath)) {
      skipped++;
      safeMap[id] = `${id}.png`;
      for (const s of seasons) safeMap[`${id}|${s}`] = `${id}.png`;
      if (i % 50 === 0) process.stdout.write(`  [${i + 1}/${ids.length}] cached ${label}\n`);
      continue;
    }

    process.stdout.write(`  [${i + 1}/${ids.length}] ${label}... `);

    let ok = await downloadImage(espnUrl(id), destPath);
    if (!ok) {
      await sleep(100);
      ok = await downloadImage(nbaUrl(id), destPath);
    }

    if (ok) {
      downloaded++;
      safeMap[id] = `${id}.png`;
      for (const s of seasons) safeMap[`${id}|${s}`] = `${id}.png`;
      process.stdout.write("✅\n");
    } else {
      failed++;
      process.stdout.write("❌ not found\n");
    }

    await sleep(SLEEP_MS);
  }

  const mapPath = join(HEADSHOT_DIR, "safe-headshot-map.json");
  writeFileSync(mapPath, JSON.stringify(safeMap, null, 2));

  console.log("\n📊 Results:");
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Skipped (cached): ${skipped}`);
  console.log(`   Not found: ${failed}`);
  console.log(`   Map written: ${mapPath}`);
  console.log(`\n✅ Done.`);
  if (failed > 0) {
    console.log(
      `\n⚠ ${failed} headshot(s) couldn't be sourced. These show as fallback (initials) in the UI.`
    );
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

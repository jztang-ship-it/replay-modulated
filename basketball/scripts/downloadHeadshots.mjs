/**
 * downloadHeadshots.mjs
 * Downloads NBA player headshots locally for offline use.
 * Uses ESPN's CDN which doesn't block automated requests.
 * 
 * Run from basketball/ directory:
 *   node scripts/downloadHeadshots.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = join(__dirname, "../public/data");
const HEADSHOT_DIR = join(__dirname, "../public/headshots");

const SLEEP_MS = 150; // be polite to the CDN
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ESPN headshot URL format — works reliably without blocking
function espnUrl(nbaId) {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${nbaId}.png&w=260&h=190&scale=crop`;
}

// NBA CDN as fallback
function nbaUrl(nbaId) {
  return `https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${nbaId}.png`;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = await res.arrayBuffer();
  // Reject tiny images (< 2KB = probably a placeholder/error image)
  if (buf.byteLength < 2000) return false;
  writeFileSync(destPath, Buffer.from(buf));
  return true;
}

async function main() {
  mkdirSync(HEADSHOT_DIR, { recursive: true });

  const players = JSON.parse(readFileSync(join(DATA_DIR, "players.json"), "utf8"));
  const ids = [...new Set(players.map(p => p.basePlayerId).filter(Boolean))].sort();

  console.log(`📸 Downloading headshots for ${ids.length} players...`);
  console.log(`   Saving to: ${HEADSHOT_DIR}\n`);

  let downloaded = 0, skipped = 0, failed = 0;
  const safeMap = {}; // maps "basePlayerId|season" → filename

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const destPath = join(HEADSHOT_DIR, `${id}.png`);

    // Skip if already downloaded
    if (existsSync(destPath)) {
      skipped++;
      // Still register in safeMap for all seasons
      players.filter(p => p.basePlayerId === id).forEach(p => {
        safeMap[`${id}|${p.season}`] = `${id}.png`;
        safeMap[id] = `${id}.png`;
      });
      continue;
    }

    process.stdout.write(`  [${i+1}/${ids.length}] ${id}... `);

    // Try ESPN first, fall back to NBA CDN
    let ok = await downloadImage(espnUrl(id), destPath);
    if (!ok) {
      await sleep(100);
      ok = await downloadImage(nbaUrl(id), destPath);
    }

    if (ok) {
      downloaded++;
      players.filter(p => p.basePlayerId === id).forEach(p => {
        safeMap[`${id}|${p.season}`] = `${id}.png`;
        safeMap[id] = `${id}.png`;
      });
      process.stdout.write(`✅\n`);
    } else {
      failed++;
      process.stdout.write(`❌ not found\n`);
    }

    await sleep(SLEEP_MS);
  }

  // Write the safe headshot map so AthleteCardFront can look up by key
  const mapPath = join(HEADSHOT_DIR, "safe-headshot-map.json");
  writeFileSync(mapPath, JSON.stringify(safeMap, null, 2));

  console.log(`\n📊 Results:`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Skipped (cached): ${skipped}`);
  console.log(`   Not found: ${failed}`);
  console.log(`   Map written: ${mapPath}`);
  console.log(`\n✅ Done.`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });

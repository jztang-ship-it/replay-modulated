/**
 * downloadHeadshots.mjs — Baseball
 * Downloads MLB player headshots from MLB's official CDN.
 *
 * Run from baseball/scripts/:
 *   node downloadHeadshots.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = join(__dirname, '../public/data');
const HEADSHOT_DIR = join(__dirname, '../public/headshots');

const SLEEP_MS = 200; // be polite to MLB CDN
const sleep = ms => new Promise(r => setTimeout(r, ms));

// MLB official headshot CDN
function mlbUrl(playerId) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_400,q_auto:best/v1/people/${playerId}/headshot/silo/current`;
}

async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000) return false; // reject placeholders
    writeFileSync(destPath, Buffer.from(buf));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  mkdirSync(HEADSHOT_DIR, { recursive: true });

  const players = JSON.parse(readFileSync(join(DATA_DIR, 'players.json'), 'utf8'));
  const ids = [...new Set(players.map(p => p.basePlayerId).filter(Boolean))].sort();

  console.log(`📸 Downloading headshots for ${ids.length} players...`);
  console.log(`   Saving to: ${HEADSHOT_DIR}\n`);

  let downloaded = 0, skipped = 0, failed = 0;
  const safeMap = {}; // mirrors basketball's safe-headshot-map.json pattern

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const destPath = join(HEADSHOT_DIR, `${id}.png`);

    if (existsSync(destPath)) {
      skipped++;
      safeMap[id] = `${id}.png`;
      safeMap[`${id}|2425`] = `${id}.png`;
      continue;
    }

    process.stdout.write(`  [${i + 1}/${ids.length}] ${id}... `);

    const ok = await downloadImage(mlbUrl(id), destPath);

    if (ok) {
      downloaded++;
      safeMap[id] = `${id}.png`;
      safeMap[`${id}|2425`] = `${id}.png`;
      process.stdout.write(`✅\n`);
    } else {
      failed++;
      process.stdout.write(`❌ not found\n`);
    }

    await sleep(SLEEP_MS);
  }

  // Write safe-headshot-map.json — same pattern as basketball
  const mapPath = join(HEADSHOT_DIR, 'safe-headshot-map.json');
  writeFileSync(mapPath, JSON.stringify(safeMap, null, 2));

  console.log(`\n📊 Results:`);
  console.log(`   Downloaded:       ${downloaded}`);
  console.log(`   Skipped (cached): ${skipped}`);
  console.log(`   Not found:        ${failed}`);
  console.log(`   Map written:      ${mapPath}`);
  console.log(`\n✅ Done.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

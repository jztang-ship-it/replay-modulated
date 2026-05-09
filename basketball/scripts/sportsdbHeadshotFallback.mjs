/**
 * sportsdbHeadshotFallback.mjs
 *
 * Uses TheSportsDB's free public API to fetch player-era basketball
 * headshots. Wikipedia's REST API thumbnails were post-career portraits
 * (Jason Kidd in a suit, etc.). TheSportsDB stores actual playing-era
 * photos for nearly every NBA player, retired or active.
 *
 * Override strategy (heuristic by file size):
 *   - Local PNG < 30 KB → assume NBA-CDN sourced, KEEP (NBA's small
 *     photos are 12-20 KB and are canonical for recent players).
 *   - Local PNG >= 30 KB → assume Wikipedia-sourced, OVERWRITE if a
 *     TheSportsDB result is available.
 *   - No local PNG → fetch from TheSportsDB.
 *
 * Endpoint: https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p={name}
 *   Returns array of player objects. We pick the first whose sport is
 *   Basketball (skips soccer / cricket etc. with the same name).
 *
 * Idempotent: re-runs only fetch when the file is missing or marked as
 * Wiki-large. Use --force to refresh everything.
 *
 * Flags: --dry-run, --limit=N, --force (refetch all)
 *
 * Run AFTER refreshHeadshots.mjs and wikipediaHeadshotFallback.mjs.
 */

import { writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = process.env.SEASONS_DIR ?? join(__dirname, '../public/data/seasons');
const HEADSHOT_DIR = process.env.HEADSHOT_DIR ?? join(__dirname, '../public/headshots');

const args = parseArgs(process.argv.slice(2));
const dryRun = args['dry-run'] === true;
const force = args['force'] === true;
const LIMIT = Number(args['limit'] ?? Infinity);

const NBA_SIZE_CEILING = 30000; // bytes — heuristic for "NBA-sourced photo"
const SLEEP_MS = 1100;          // be polite to free public API
const sleep = ms => new Promise(r => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (compatible; ReplayMod/1.0)';

async function searchPlayer(name) {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`,
      { headers: { 'User-Agent': UA } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const players = data?.player ?? [];
    // Prefer basketball matches; reject other sports with same name.
    return players.find(p => p?.strSport === 'Basketball') ?? null;
  } catch {
    return null;
  }
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 4000) return null;
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

function collectTargets() {
  // {id → name} from all seasons.
  const idToName = new Map();
  const seasons = readdirSync(SEASONS_DIR).filter(e => {
    if (e.startsWith('_') || e.startsWith('.')) return false;
    return statSync(join(SEASONS_DIR, e)).isDirectory();
  });
  for (const k of seasons) {
    const players = JSON.parse(readFileSync(join(SEASONS_DIR, k, 'players.json'), 'utf8'));
    for (const p of players) {
      const id = String(p.basePlayerId ?? '').trim();
      const name = String(p.name ?? '').trim();
      if (!id || !name) continue;
      if (!idToName.has(id)) idToName.set(id, name);
    }
  }

  // Decide what to fetch: missing OR (large local file = Wiki-sourced) OR force.
  const targets = [];
  for (const [id, name] of idToName) {
    const localPath = join(HEADSHOT_DIR, `${id}.png`);
    if (!existsSync(localPath)) {
      targets.push({ id, name, reason: 'missing' });
    } else if (force) {
      targets.push({ id, name, reason: 'force' });
    } else {
      const size = statSync(localPath).size;
      if (size >= NBA_SIZE_CEILING) {
        targets.push({ id, name, reason: 'replace-wiki' });
      }
    }
  }
  return targets;
}

async function main() {
  if (!existsSync(HEADSHOT_DIR)) {
    console.error(`❌ ${HEADSHOT_DIR} not found.`);
    process.exit(1);
  }

  const targets = collectTargets().slice(0, LIMIT);
  const byReason = targets.reduce((m, t) => { m[t.reason] = (m[t.reason] ?? 0) + 1; return m; }, {});
  console.log(`🎯 Targets (${targets.length}):`);
  for (const [reason, n] of Object.entries(byReason)) console.log(`   ${reason}: ${n}`);
  console.log('');

  let downloaded = 0, replaced = 0, noMatch = 0, downloadFailed = 0;
  for (let i = 0; i < targets.length; i++) {
    const { id, name, reason } = targets[i];
    process.stdout.write(`  [${i + 1}/${targets.length}] ${id} ${name} (${reason})... `);

    const player = await searchPlayer(name);
    if (!player) {
      noMatch++;
      process.stdout.write('— no basketball match\n');
      await sleep(SLEEP_MS);
      continue;
    }

    const photoUrl = player.strThumb || player.strCutout;
    if (!photoUrl) {
      noMatch++;
      process.stdout.write('— matched, no photo\n');
      await sleep(SLEEP_MS);
      continue;
    }

    const buf = await downloadImage(photoUrl);
    if (!buf) {
      downloadFailed++;
      process.stdout.write('✗ image fetch failed\n');
      await sleep(SLEEP_MS);
      continue;
    }

    const destPath = join(HEADSHOT_DIR, `${id}.png`);
    if (!dryRun) writeFileSync(destPath, buf);
    if (reason === 'replace-wiki' || reason === 'force') replaced++; else downloaded++;
    process.stdout.write(`✅ ${buf.length} bytes\n`);

    await sleep(SLEEP_MS);
  }

  console.log(`\n📊 Results:`);
  console.log(`   Downloaded (was missing): ${downloaded}`);
  console.log(`   Replaced (was Wiki):      ${replaced}`);
  console.log(`   No match:                 ${noMatch}`);
  console.log(`   Download failed:          ${downloadFailed}`);
  if (dryRun) console.log('\n[dry-run] no files written');
  else console.log('\n✅ Done. Re-run syncHeadshotsToSupabase.mjs to push to Supabase.');
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v ?? true;
  }
  return out;
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

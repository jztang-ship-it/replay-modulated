/**
 * wikipediaHeadshotFallback.mjs
 *
 * Walks each season's players.json and attempts to fetch a headshot
 * via Wikipedia's REST API for any player WITHOUT a local PNG. NBA
 * CDN doesn't have photos for many pre-2000 / journeyman players —
 * Wikipedia has thumbnails for most.
 *
 * Source: https://en.wikipedia.org/api/rest_v1/page/summary/{Title}
 *   - title is built from `Player_Name` with spaces → underscores
 *   - response.thumbnail.source is the image URL (already optimized)
 *   - some players have no Wikipedia page (return undefined thumbnail)
 *
 * Quality caveat: Wikipedia thumbnails aren't NBA-style headshots. They
 * may be group photos, action shots, or post-career portraits. Better
 * than initials, worse than a clean headshot.
 *
 * Run AFTER refreshHeadshots.mjs (which establishes the "missing" set).
 *
 * Idempotent — only fetches IDs that don't already have a local PNG.
 *
 * Flags: --dry-run, --limit=N (process at most N missing players, useful
 *        for testing before a full run)
 */

import { writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Override via env vars when running from a checkout where the data
// or headshots live elsewhere (e.g. running this script from the main
// checkout while seasons data lives in a worktree).
const SEASONS_DIR = process.env.SEASONS_DIR ?? join(__dirname, '../public/data/seasons');
const HEADSHOT_DIR = process.env.HEADSHOT_DIR ?? join(__dirname, '../public/headshots');

const args = parseArgs(process.argv.slice(2));
const dryRun = args['dry-run'] === true;
const LIMIT = Number(args['limit'] ?? Infinity);

const SLEEP_MS = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (compatible; ReplayMod/1.0; +https://replay-modulated.vercel.app)';

function wikiTitle(name) {
  // Wikipedia titles use underscores for spaces. Diacritics are preserved
  // (Wikipedia handles unicode in URLs). Some players go by nicknames in
  // the data — e.g. "Popeye Jones" — and Wikipedia's redirect chain
  // usually resolves those.
  return encodeURIComponent(name.trim().replace(/\s+/g, '_'));
}

async function fetchWikiThumbnail(name) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle(name)}`,
      { headers: { 'User-Agent': UA, accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const url = data?.thumbnail?.source;
    if (!url) return null;
    // Wikipedia thumbnails default to small (~330px); upgrade to ~600px
    // by replacing /330px-/ with /600px-/ in the URL. Falls through to
    // original if the pattern doesn't match.
    return url.replace(/\/(\d+)px-/, '/600px-');
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

function collectMissingPlayers() {
  // Build {id → name} for every player across all seasons; pick the
  // first occurrence (any season's identity fields are equivalent).
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

  // Filter to those missing a local PNG.
  const missing = [];
  for (const [id, name] of idToName) {
    if (!existsSync(join(HEADSHOT_DIR, `${id}.png`))) {
      missing.push({ id, name });
    }
  }
  return missing;
}

async function main() {
  if (!existsSync(HEADSHOT_DIR)) {
    console.error(`❌ ${HEADSHOT_DIR} not found.`);
    process.exit(1);
  }

  const missing = collectMissingPlayers();
  const target = missing.slice(0, LIMIT);
  console.log(`📋 Missing ${missing.length} players locally; processing ${target.length}\n`);

  let downloaded = 0, noWikiPage = 0, noThumbnail = 0, fetchFailed = 0;
  for (let i = 0; i < target.length; i++) {
    const { id, name } = target[i];
    process.stdout.write(`  [${i + 1}/${target.length}] ${id} ${name}... `);

    const thumbUrl = await fetchWikiThumbnail(name);
    if (!thumbUrl) {
      noWikiPage++;
      process.stdout.write('— no wiki page / no thumbnail\n');
      await sleep(SLEEP_MS);
      continue;
    }

    const buf = await downloadImage(thumbUrl);
    if (!buf) {
      fetchFailed++;
      process.stdout.write('✗ thumbnail fetch failed\n');
      await sleep(SLEEP_MS);
      continue;
    }

    const destPath = join(HEADSHOT_DIR, `${id}.png`);
    if (!dryRun) writeFileSync(destPath, buf);
    downloaded++;
    process.stdout.write(`✅ ${buf.length} bytes\n`);

    await sleep(SLEEP_MS);
  }

  console.log(`\n📊 Results:`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   No Wikipedia page or no photo: ${noWikiPage}`);
  console.log(`   Thumbnail fetch failed: ${fetchFailed}`);
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

/**
 * deleteSupabaseOrphans.mjs
 *
 * Deletes Supabase Storage headshot files that no longer exist locally.
 * Run AFTER refreshHeadshots.mjs (which removes wrong-face PNGs from
 * the local cache) and AFTER uploadHeadshots.mjs (which pushes the
 * corrected set up).
 *
 * Without this, the wrong-face PNGs uploaded by the original ESPN-broken
 * download still serve from the CDN, even though we've removed them
 * locally. Once they're gone from Supabase, the URL 404s and the UI's
 * initials-fallback takes over.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (the bucket has RLS — anon key
 * cannot delete). Get it from Project Settings → API → service_role.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="..." node basketball/scripts/deleteSupabaseOrphans.mjs
 *   SUPABASE_SERVICE_ROLE_KEY="..." node basketball/scripts/deleteSupabaseOrphans.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADSHOT_DIR = join(__dirname, '../public/headshots');

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://hnhrpwwznzokkfagfumb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var. Get it from Project Settings → API → service_role.');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const dryRun = args['dry-run'] === true;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'headshots';
const PREFIX = 'nba';

async function listAll() {
  const all = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, { limit: PAGE, offset });
    if (error) {
      console.error('list failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all.push(...data.map(f => f.name));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  if (!existsSync(HEADSHOT_DIR)) {
    console.error(`❌ ${HEADSHOT_DIR} not found.`);
    process.exit(1);
  }

  const localFiles = new Set(readdirSync(HEADSHOT_DIR).filter(f => f.endsWith('.png')));
  console.log(`📂 Local: ${localFiles.size} PNGs`);

  const remoteFiles = await listAll();
  const remotePngs = remoteFiles.filter(f => f.endsWith('.png'));
  console.log(`☁  Remote: ${remotePngs.length} PNGs in ${BUCKET}/${PREFIX}`);

  const orphans = remotePngs.filter(f => !localFiles.has(f));
  console.log(`🗑  Orphans (in Supabase, not local): ${orphans.length}`);

  if (orphans.length === 0) {
    console.log('✅ Nothing to delete.');
    return;
  }

  console.log(`   Sample: ${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? `, ... (+${orphans.length - 8} more)` : ''}`);

  if (dryRun) {
    console.log('\n[dry-run] no files deleted');
    return;
  }

  // Batch deletes — Supabase accepts arrays of paths.
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += BATCH) {
    const slice = orphans.slice(i, i + BATCH).map(f => `${PREFIX}/${f}`);
    const { error } = await supabase.storage.from(BUCKET).remove(slice);
    if (error) {
      console.error(`Batch ${i}-${i + slice.length} failed:`, error.message);
      continue;
    }
    deleted += slice.length;
    process.stdout.write(`  Deleted ${deleted}/${orphans.length}\n`);
  }

  console.log(`\n✅ Removed ${deleted} orphan headshot(s) from Supabase Storage.`);
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v ?? true;
  }
  return out;
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

/**
 * syncHeadshotsToSupabase.mjs
 *
 * One-shot uploader + orphan deleter using raw fetch (no @supabase/supabase-js).
 * Bypasses the SDK's JWT validation that was rejecting `sb_secret_*` keys
 * with "Invalid Compact JWS".
 *
 * What it does:
 *   1. Walks local public/headshots/*.png — these are the canonical set
 *      after refreshHeadshots.mjs ran.
 *   2. Lists every PNG already in Supabase Storage at headshots/nba/.
 *   3. Uploads any local file that's missing remotely OR whose size
 *      differs from the remote (replaces wrong-face overwrites).
 *   4. Deletes any remote file that no longer exists locally (orphans
 *      from the original ESPN-broken download).
 *
 * Usage:
 *   SUPABASE_KEY="<service_role_or_secret_key>" node scripts/syncHeadshotsToSupabase.mjs
 *   SUPABASE_KEY="..." node scripts/syncHeadshotsToSupabase.mjs --dry-run
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADSHOT_DIR = join(__dirname, '../public/headshots');

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://hnhrpwwznzokkfagfumb.supabase.co';
const KEY = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!KEY) {
  console.error('Missing SUPABASE_KEY env var (also accepts SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).');
  console.error('Get the service-role / secret key from Project Settings → API.');
  process.exit(1);
}

const BUCKET = 'headshots';
const PREFIX = 'nba';
const dryRun = process.argv.includes('--dry-run');

const headers = (extra = {}) => ({
  Authorization: `Bearer ${KEY}`,
  apikey: KEY,
  ...extra,
});

async function listAllRemote() {
  // Storage list API: POST /storage/v1/object/list/{bucket}
  const all = new Map(); // name → size
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: PREFIX, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) {
      console.error('list failed:', res.status, await res.text());
      process.exit(1);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const f of data) {
      if (f.name && f.name.endsWith('.png')) {
        all.set(f.name, f.metadata?.size ?? 0);
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function uploadOne(name, body) {
  // Storage upload: POST /storage/v1/object/{bucket}/{path}, x-upsert: true
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${PREFIX}/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'image/png', 'x-upsert': 'true' }),
    body,
  });
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${await res.text()}` };
  }
  return { ok: true };
}

async function deleteBatch(paths) {
  // Storage batch delete: DELETE /storage/v1/object/{bucket} with JSON body { prefixes: [...] }
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${await res.text()}` };
  }
  return { ok: true };
}

async function main() {
  if (!existsSync(HEADSHOT_DIR)) {
    console.error(`❌ ${HEADSHOT_DIR} not found.`);
    process.exit(1);
  }

  const localFiles = readdirSync(HEADSHOT_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ name: f, size: statSync(join(HEADSHOT_DIR, f)).size }));
  console.log(`📂 Local: ${localFiles.length} PNGs`);

  console.log(`🔍 Listing Supabase Storage ${BUCKET}/${PREFIX}/ ...`);
  const remote = await listAllRemote();
  console.log(`☁  Remote: ${remote.size} PNGs`);

  const localByName = new Map(localFiles.map(f => [f.name, f.size]));

  // Plan uploads: missing remote OR size differs.
  const toUpload = localFiles.filter(f => {
    const remoteSize = remote.get(f.name);
    return remoteSize === undefined || remoteSize !== f.size;
  });

  // Plan deletes: in remote, not in local.
  const toDelete = [...remote.keys()].filter(name => !localByName.has(name));

  console.log(`\n📊 Plan:`);
  console.log(`   Upload (new or changed): ${toUpload.length}`);
  console.log(`   Delete (orphan): ${toDelete.length}`);
  console.log(`   Untouched: ${remote.size - toDelete.length - toUpload.filter(f => remote.has(f.name)).length}`);

  if (dryRun) {
    console.log('\n[dry-run] no changes made');
    if (toDelete.length > 0) {
      console.log(`   Sample orphans: ${toDelete.slice(0, 8).join(', ')}${toDelete.length > 8 ? `, ... (+${toDelete.length - 8} more)` : ''}`);
    }
    return;
  }

  // Uploads
  if (toUpload.length) {
    console.log(`\n⬆  Uploading ${toUpload.length}...`);
    let okCount = 0, failCount = 0;
    for (let i = 0; i < toUpload.length; i++) {
      const f = toUpload[i];
      const body = readFileSync(join(HEADSHOT_DIR, f.name));
      const r = await uploadOne(f.name, body);
      if (r.ok) okCount++; else { failCount++; if (failCount < 5) console.error(`  ${f.name}: ${r.error}`); }
      if ((i + 1) % 100 === 0 || i === toUpload.length - 1) {
        process.stdout.write(`  uploaded ${i + 1}/${toUpload.length} (${okCount} ok, ${failCount} fail)\n`);
      }
    }
  }

  // Deletes (batched at 100)
  if (toDelete.length) {
    console.log(`\n🗑  Deleting ${toDelete.length} orphans...`);
    const BATCH = 100;
    let done = 0;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const slice = toDelete.slice(i, i + BATCH).map(n => `${PREFIX}/${n}`);
      const r = await deleteBatch(slice);
      if (!r.ok) {
        console.error(`  batch ${i}: ${r.error}`);
      } else {
        done += slice.length;
      }
      process.stdout.write(`  deleted ${done}/${toDelete.length}\n`);
    }
  }

  console.log('\n✅ Sync complete.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

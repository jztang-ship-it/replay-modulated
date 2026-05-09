/**
 * refreshHeadshots.mjs
 *
 * One-shot fix for the ESPN-mismapped wrong-face problem. The original
 * downloadHeadshots.mjs tried ESPN's CDN first using NBA stats IDs, but
 * ESPN player IDs are unrelated to NBA stats IDs — so every ESPN hit
 * returned an unrelated player's photo. Result: ~hundreds of wrong-face
 * PNGs for older NBA players in the local cache and Supabase Storage.
 *
 * This script walks every existing local headshot PNG, refetches from
 * NBA CDN (the canonical source for NBA stats IDs), and:
 *   - overwrites the local file if NBA returns a real headshot (>8KB)
 *   - deletes the local file if NBA returns a 404 / placeholder
 *
 * After running, the local cache only contains correct photos. The UI's
 * initials fallback covers IDs without a local file.
 *
 * Re-run uploadHeadshots.mjs after this to push the corrected set to
 * Supabase Storage.
 *
 * Idempotent. Flags: --dry-run
 */

import { readdirSync, statSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADSHOT_DIR = join(__dirname, "../public/headshots");
const PLACEHOLDER_REJECT_BYTES = 8000;
const SLEEP_MS = 150;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === true;

function nbaUrl(id) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
}

async function fetchHeadshot(id) {
  try {
    const res = await fetch(nbaUrl(id), { headers: { "User-Agent": "Mozilla/5.0 ReplayMod/1.0" } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < PLACEHOLDER_REJECT_BYTES) return null;
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

if (!existsSync(HEADSHOT_DIR)) {
  console.error(`❌ ${HEADSHOT_DIR} not found.`);
  process.exit(1);
}

const files = readdirSync(HEADSHOT_DIR).filter(f => f.endsWith(".png"));
console.log(`🔁 Refreshing ${files.length} headshots from NBA CDN${dryRun ? " (dry-run)" : ""}\n`);

let kept = 0, replaced = 0, deleted = 0, unchanged = 0;

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const id = f.replace(/\.png$/, "");
  const localPath = join(HEADSHOT_DIR, f);
  const localSize = statSync(localPath).size;
  process.stdout.write(`  [${i + 1}/${files.length}] ${id} (${localSize} bytes)... `);

  const fresh = await fetchHeadshot(id);

  if (fresh) {
    if (fresh.length === localSize) {
      unchanged++;
      process.stdout.write("≡ unchanged\n");
    } else {
      replaced++;
      if (!dryRun) writeFileSync(localPath, fresh);
      process.stdout.write(`✏️  replaced (${fresh.length} bytes)\n`);
    }
    kept++;
  } else {
    deleted++;
    if (!dryRun) unlinkSync(localPath);
    process.stdout.write("🗑️  deleted (NBA has no real headshot)\n");
  }

  await sleep(SLEEP_MS);
}

console.log("\n📊 Results:");
console.log(`   Kept (unchanged):   ${unchanged}`);
console.log(`   Replaced (refreshed): ${replaced}`);
console.log(`   Deleted (no real photo): ${deleted}`);
console.log(`   Total kept: ${kept} / ${files.length}`);
if (dryRun) console.log("\n[dry-run] no files written or deleted");
else console.log("\n✅ Refresh complete. Re-run uploadHeadshots.mjs to push to Supabase.");

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}

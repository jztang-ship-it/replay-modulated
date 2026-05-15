/**
 * curatedHeadshots.mjs
 *
 * Re-fetches the curated set of player headshots from external sources and
 * writes them to basketball/public/headshots/. Use this to reproduce the
 * hand-curated photo selections after a fresh refreshHeadshots run, or to
 * recover the local cache if Supabase is ever wiped.
 *
 * Source of truth: basketball/scripts/curated-headshots.json
 * Each entry maps a basePlayerId to a public URL of a clean profile-quality
 * headshot (transparent bg, head + shoulders, no busy background). Most come
 * from 2kratings.com; the silhouette comes from NBA's official placeholder.
 *
 * After running this, follow up with `uploadHeadshots.mjs` to sync local →
 * Supabase Storage.
 *
 * Idempotent. Flags: --dry-run, --only=<id>
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADSHOT_DIR = join(__dirname, "../public/headshots");
const MANIFEST = join(__dirname, "curated-headshots.json");
const SLEEP_MS = 250; // be nice to source CDN
const MIN_BYTES = 4000; // anything smaller is likely a placeholder/error

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap(a => {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      return [[k, v ?? true]];
    }
    return [];
  })
);
const dryRun = args["dry-run"] === true;
const only = args.only;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOne(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) return null;
  return buf;
}

async function maybeDarkenSilhouette(buf) {
  // The NBA placeholder source is RGB(142,145,150). We ship it darkened to
  // RGB(30,30,32) so it reads as a true silhouette on tier-colored cards.
  const pngjs = await import("pngjs").catch(() => null);
  if (!pngjs) {
    console.warn("    pngjs not installed; skipping darken step (silhouette will be source gray, not near-black). `npm i --no-save pngjs` to enable.");
    return buf;
  }
  const png = pngjs.PNG.sync.read(buf);
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] > 0) {
      png.data[i] = 30;
      png.data[i + 1] = 30;
      png.data[i + 2] = 32;
    }
  }
  return pngjs.PNG.sync.write(png);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entries = only ? manifest.entries.filter(e => e.basePlayerId === only) : manifest.entries;

console.log(`Curated-headshot restore: ${entries.length} entries${dryRun ? " (dry-run)" : ""}`);
if (only) console.log(`  filtered to basePlayerId=${only}`);
console.log();

let ok = 0, skipped = 0, failed = 0;
for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  const dest = join(HEADSHOT_DIR, `${e.basePlayerId}.png`);
  process.stdout.write(`  [${i + 1}/${entries.length}] ${e.basePlayerId.padEnd(10)} ${e.name.slice(0, 28).padEnd(30)} ... `);
  try {
    let buf = await fetchOne(e.source);
    if (!buf) {
      process.stdout.write(`FAIL (source returned <${MIN_BYTES} bytes or non-200)\n`);
      failed++;
      continue;
    }
    if (e.basePlayerId === "_silhouette") {
      buf = await maybeDarkenSilhouette(buf);
    }
    if (!dryRun) writeFileSync(dest, buf);
    process.stdout.write(`OK (${buf.length} bytes)\n`);
    ok++;
  } catch (err) {
    process.stdout.write(`ERR ${err.message}\n`);
    failed++;
  }
  if (i < entries.length - 1) await sleep(SLEEP_MS);
}

console.log();
console.log(`Done. OK: ${ok}, failed: ${failed}, skipped: ${skipped}`);
if (manifest.excludedDoNotRestore?.length) {
  console.log();
  console.log(`Reminder: the following ${manifest.excludedDoNotRestore.length} players have 2K-generated renders on source — do NOT restore:`);
  for (const x of manifest.excludedDoNotRestore) {
    console.log(`  ${x.id}  ${x.name}  ←  ${x.url}`);
  }
}
console.log();
console.log("Next: run `node scripts/uploadHeadshots.mjs` to sync to Supabase Storage.");

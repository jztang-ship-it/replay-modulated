/**
 * pruneOrphanHeadshots.mjs
 *
 * Removes local headshot PNGs whose basePlayerId no longer appears in any
 * season's players.json (post-prune). Also rewrites
 * public/headshots/safe-headshot-map.json without the orphan entries.
 *
 * Local-only — does NOT touch the Supabase Storage bucket. Re-run
 * `uploadHeadshots.mjs` after this if you want to drop the orphans
 * remotely too (the uploader is idempotent and only uploads files that
 * exist locally).
 *
 * Idempotent. Flags: --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");
const HEADSHOT_DIR = join(__dirname, "..", "public", "headshots");
const MAP_PATH = join(HEADSHOT_DIR, "safe-headshot-map.json");

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === true;

if (!existsSync(HEADSHOT_DIR)) {
  console.error(`❌ ${HEADSHOT_DIR} not found.`);
  process.exit(1);
}

// Aggregate kept basePlayerIds across all seasons.
const keptIds = new Set();
const seasonKeys = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
});
for (const key of seasonKeys) {
  const playersPath = join(SEASONS_DIR, key, "players.json");
  if (!existsSync(playersPath)) continue;
  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  for (const p of players) {
    const id = String(p.basePlayerId ?? "").trim();
    if (id) keptIds.add(id);
  }
}

console.log(`📋 ${keptIds.size} unique basePlayerIds kept across ${seasonKeys.length} seasons`);

// Walk headshots dir and partition into keep/orphan.
const files = readdirSync(HEADSHOT_DIR).filter(f => f.endsWith(".png"));
const orphans = [];
let kept = 0;
for (const f of files) {
  const id = f.replace(/\.png$/, "");
  if (keptIds.has(id)) kept++;
  else orphans.push(f);
}

console.log(`📸 Local headshots: ${files.length} total → ${kept} kept, ${orphans.length} orphaned`);

if (orphans.length === 0) {
  console.log("✅ Nothing to prune.");
  process.exit(0);
}

// Show a sample so the user can sanity-check.
const sample = orphans.slice(0, 10);
console.log(`   Sample orphans: ${sample.join(", ")}${orphans.length > 10 ? `, … (+${orphans.length - 10} more)` : ""}`);

if (dryRun) {
  console.log("\n[dry-run] no files deleted");
  process.exit(0);
}

// Delete orphan PNGs.
for (const f of orphans) {
  unlinkSync(join(HEADSHOT_DIR, f));
}

// Rewrite safe-headshot-map.json keeping only entries whose id is kept.
if (existsSync(MAP_PATH)) {
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  const cleaned = {};
  for (const [k, v] of Object.entries(map)) {
    // Keys are either "{id}" or "{id}|{season}". Both should reference a kept id.
    const id = k.split("|")[0];
    if (keptIds.has(id)) cleaned[k] = v;
  }
  writeFileSync(MAP_PATH, JSON.stringify(cleaned, null, 2));
  console.log(`✏  safe-headshot-map.json rewritten (${Object.keys(map).length} → ${Object.keys(cleaned).length} entries)`);
}

console.log(`\n✅ Deleted ${orphans.length} orphan headshot(s).`);
console.log("\nNext (optional): re-run uploadHeadshots.mjs to drop these from Supabase Storage too.");

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}

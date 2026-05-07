/**
 * merge2324IntoPlayers.mjs
 *
 * Merges the 316 2023-24 player aggregates (from players_2324.preview.json)
 * into the live players.json, preserving the salary-desc sort order.
 *
 * Idempotent: running twice doesn't duplicate entries (keys by `id`).
 *
 * Usage:
 *   node basketball/scripts/merge2324IntoPlayers.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "public", "data");

const playersPath = join(DATA_DIR, "players.json");
const previewPath = join(DATA_DIR, "players_2324.preview.json");

const existing = JSON.parse(readFileSync(playersPath, "utf8"));
const newEntries = JSON.parse(readFileSync(previewPath, "utf8"));

const byId = new Map();
for (const p of existing) byId.set(String(p.id), p);
for (const p of newEntries) byId.set(String(p.id), p);

const merged = [...byId.values()].sort((a, b) => Number(b.salary) - Number(a.salary));

writeFileSync(playersPath, JSON.stringify(merged, null, 2));

const seasonCounts = {};
for (const p of merged) {
  const s = String(p.season ?? "?");
  seasonCounts[s] = (seasonCounts[s] ?? 0) + 1;
}

console.log(`✅ Merged. Total entries: ${merged.length}`);
console.log("Per season:", seasonCounts);

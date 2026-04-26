#!/usr/bin/env node
/**
 * scripts/promote-basketball-red.mjs
 *
 * Adds a RED tier to basketball/public/data/players.json by promoting any
 * player with salary >= 73 from ORANGE → RED. Matches what the live UI has
 * been rendering all along (the salary-derived fallback in PlayerCardShell.tsx
 * + CardFront.tsx had a 73+ → RED branch with no corresponding data backing).
 *
 * One-off. Run once to align data with UI; afterward maintain RED via
 * normal player-data updates.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAYERS_PATH = join(resolve(__dirname, ".."), "basketball/public/data/players.json");
const RED_THRESHOLD = 73;

const players = JSON.parse(readFileSync(PLAYERS_PATH, "utf8"));
let promoted = 0;
const promotedNames = [];
for (const p of players) {
  if (Number(p.salary ?? 0) >= RED_THRESHOLD && p.tier !== "RED") {
    promotedNames.push(`${p.name} (${p.position}, $${p.salary}, avgFP ${p.avgFP ?? "?"})`);
    p.tier = "RED";
    promoted++;
  }
}

writeFileSync(PLAYERS_PATH, JSON.stringify(players, null, 2) + "\n", "utf8");

console.log(`Promoted ${promoted} basketball player(s) to RED (salary >= $${RED_THRESHOLD}):`);
for (const n of promotedNames) console.log("  " + n);
console.log(`Wrote: ${PLAYERS_PATH}`);

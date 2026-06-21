#!/usr/bin/env node
// scripts/boss-band-table.mjs
//
// Phase 2-mount step-1 STOP output: for each of the 15 candidate bosses, roll its
// target against ITS OWN season's band (bossBands.generated.json) and print the
// review table for John. Beatable → daily roll (target in [P60,P85]); marquee →
// raid roll (target ≥ P85, brutal by design). Print-only; not a committed
// artifact. Run: node --import tsx scripts/boss-band-table.mjs
import { loadBankBosses, rollBoss, K } from "../basketball/src/tools/bossGenerator.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const bands = JSON.parse(readFileSync(resolve(HERE, "../api/boss/_lib/bossBands.generated.json"), "utf8")).bands;

const MARQUEE = new Set(["CHI-9798", "GSW-1516"]);
const CANDIDATES = [
  "DET-0304", "PHI-0001", "SAC-0102", "DAL-1011", "TOR-0001", "BOS-0708", "SAS-1314",
  "PHX-0607", "HOU-9697", "DEN-2223", "MIL-2021", "LAL-1920", "OKC-2425", // beatable (13)
  "CHI-9798", "GSW-1516", // marquee (2)
];
const DAY = "2026-06-22"; // fixed representative day (roll varies by day; band keeps daily in-range)

const bosses = new Map(loadBankBosses().map(b => [b.key, b]));
console.log("boss        season  tier      band[lo,hi]        floor/ceil      mode   target  status");
console.log("─".repeat(92));
for (const key of CANDIDATES) {
  const b = bosses.get(key);
  if (!b) { console.log(key.padEnd(11), "NOT IN BANK"); continue; }
  const band = bands[b.season];
  if (!band) { console.log(key.padEnd(11), `no band for season ${b.season}`); continue; }
  const marquee = MARQUEE.has(key);
  const mode = marquee ? "raid" : "daily";
  const roll = rollBoss(b, DAY, 0, mode, [band.lo, band.hi], K);
  const tier = marquee ? "MARQUEE" : "beatable";
  console.log(
    key.padEnd(11),
    String(b.season).padEnd(6),
    tier.padEnd(9),
    `[${String(band.lo).padStart(6)},${String(band.hi).padStart(6)}]`.padEnd(18),
    `${String(Math.round(b.floor)).padStart(4)}/${String(Math.round(b.ceiling)).padStart(4)}`.padEnd(14),
    mode.padEnd(6),
    String(Math.round(roll.total * 10) / 10).padStart(6),
    " ", roll.status,
  );
}

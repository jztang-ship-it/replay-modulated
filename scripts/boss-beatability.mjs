#!/usr/bin/env node
// scripts/boss-beatability.mjs
//
// Phase 2-mount step-3: beatability analysis (TOO-EASY emphasis per John).
// Per candidate boss, against ITS season band/target, with the boss five EXCLUDED
// from the recipient pool:
//   - P_random : P(a random legal draft's single roll beats the target) — the
//     "does a mediocre draft fail?" metric. HIGH = trivial (slot machine).
//   - P_best   : P(the best legal draft's single roll beats the target).
//   - best-draft expected total + margin vs target.
// Targets are averaged over 60 daily rolls (beatable=daily, marquee=raid), since
// the daily roll varies in-band. Print-only review tool.
//
// Run: node --import tsx scripts/boss-beatability.mjs
import { buildSeasonPool } from "./build-boss-bands.mjs";
import { loadBankBosses, rollBoss, K } from "../basketball/src/tools/bossGenerator.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const bands = JSON.parse(readFileSync(resolve(HERE, "../api/boss/_lib/bossBands.generated.json"), "utf8")).bands;

const SALARY_CAP = 250, ROSTER_SIZE = 5, N = 20000, DAYS = 60, SEED = 90210;
const MARQUEE = new Set(["CHI-9798", "GSW-1516"]);
const CANDIDATES = [
  "DET-0304", "PHI-0001", "SAC-0102", "DAL-1011", "TOR-0001", "BOS-0708", "SAS-1314",
  "PHX-0607", "HOU-9697", "DEN-2223", "MIL-2021", "LAL-1920", "OKC-2425",
  "CHI-9798", "GSW-1516",
];

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
// fraction of sorted ascending array strictly greater than v
function pAbove(sorted, v) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; } return (sorted.length - lo) / sorted.length; }

/** Best legal 5 under cap maximizing Σ meanFp. Greedy-by-value-density seed +
 *  local-search swaps (robust — never null; the top-meanFp players are often too
 *  pricey to all fit, so a pure top-N brute-force can find no legal 5). */
function bestDraft(pool) {
  const sumSal = f => f.reduce((s, p) => s + p.salary, 0);
  const sumVal = f => f.reduce((s, p) => s + p.meanFp, 0);
  // Seed: greedy by value density (meanFp/salary), filling 5 under cap.
  const byDensity = [...pool].sort((a, b) => b.meanFp / b.salary - a.meanFp / a.salary);
  const five = []; const used = new Set(); let cost = 0;
  for (const p of byDensity) { if (five.length === 5) break; if (cost + p.salary <= SALARY_CAP) { five.push(p); used.add(p.id); cost += p.salary; } }
  // Pad if under 5 (cheapest available).
  if (five.length < 5) for (const p of [...pool].sort((a, b) => a.salary - b.salary)) { if (five.length === 5) break; if (used.has(p.id)) continue; if (cost + p.salary <= SALARY_CAP) { five.push(p); used.add(p.id); cost += p.salary; } }
  // Local search: swap a held card for an unheld one that raises Σ meanFp under cap.
  let improved = true; let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < five.length; i++) {
      for (const cand of pool) {
        if (used.has(cand.id)) continue;
        const newCost = cost - five[i].salary + cand.salary;
        if (newCost > SALARY_CAP) continue;
        if (cand.meanFp > five[i].meanFp) {
          used.delete(five[i].id); used.add(cand.id); cost = newCost; five[i] = cand; improved = true; break;
        }
      }
      if (improved) break;
    }
  }
  void sumSal; void sumVal;
  return five;
}
function rollDist(five) { const out = []; for (let i = 0; i < N; i++) { let s = 0; for (const p of five) s += p.gamePool[Math.floor(rng() * p.gamePool.length)]; out.push(s); } out.sort((a, b) => a - b); return out; }
function randomDist(pool) {
  const out = [];
  for (let i = 0; i < N; i++) {
    let cost = 0; const picked = []; const used = new Set(); let g = 0;
    while (picked.length < ROSTER_SIZE && g++ < 200) { const c = pool[Math.floor(rng() * pool.length)]; if (used.has(c.id) || cost + c.salary > SALARY_CAP) continue; used.add(c.id); picked.push(c); cost += c.salary; }
    if (picked.length < ROSTER_SIZE) continue;
    let s = 0; for (const p of picked) s += p.gamePool[Math.floor(rng() * p.gamePool.length)]; out.push(s);
  }
  out.sort((a, b) => a - b); return out;
}

const bosses = new Map(loadBankBosses().map(b => [b.key, b]));
console.log("boss        season tier      target  P_random  bestExp  margin  P_best  maxRoll  verdict");
console.log("─".repeat(98));
const rows = [];
for (const key of CANDIDATES) {
  const b = bosses.get(key);
  const band = bands[b.season];
  const marquee = MARQUEE.has(key);
  const bossNames = new Set(b.starters.map(s => s.name));
  const pool = buildSeasonPool(b.season).filter(p => !bossNames.has(p.name));
  const best = bestDraft(pool);
  const bestExp = best.reduce((s, p) => s + p.meanFp, 0);
  const bestRolls = rollDist(best);
  const randRolls = randomDist(pool);
  // boss target distribution over DAYS days
  const targets = [];
  for (let d = 0; d < DAYS; d++) { const day = `2026-${String((d % 12) + 1).padStart(2, "0")}-${String((d % 27) + 1).padStart(2, "0")}`; targets.push(rollBoss(b, day, 0, marquee ? "raid" : "daily", [band.lo, band.hi], K).total); }
  const tMean = mean(targets);
  const pRandom = mean(targets.map(t => pAbove(randRolls, t)));
  const pBest = mean(targets.map(t => pAbove(bestRolls, t)));
  const maxRoll = bestRolls[bestRolls.length - 1];
  let verdict;
  if (marquee) verdict = maxRoll < tMean ? "BROKEN(unreachable)" : pBest < 0.005 ? "0%-trophy?" : pBest <= 0.20 ? "MARQUEE-ok" : "too-soft-for-marquee";
  else if (pBest < 0.30) verdict = "too-hard";
  else if (pRandom >= 0.33) verdict = "TOO-EASY";
  else if (pRandom <= 0.20 && pBest >= 0.55) verdict = "beatable";
  else verdict = "soft(leans-easy)";
  rows.push({ key, season: b.season, marquee, tMean, pRandom, bestExp, margin: bestExp - tMean, pBest, maxRoll, verdict, poolHi: band.hi - band.lo });
  console.log(
    key.padEnd(11), String(b.season).padEnd(6), (marquee ? "MARQUEE" : "beatable").padEnd(9),
    String(Math.round(tMean * 10) / 10).padStart(6),
    (Math.round(pRandom * 1000) / 10 + "%").padStart(8),
    String(Math.round(bestExp * 10) / 10).padStart(7),
    String(Math.round((bestExp - tMean) * 10) / 10).padStart(6),
    (Math.round(pBest * 1000) / 10 + "%").padStart(7),
    String(Math.round(maxRoll * 10) / 10).padStart(7),
    " ", verdict,
  );
}
// Beatable ranking by triviality (highest P_random = most trivial = first to cut)
console.log("\n── beatable ranked by triviality (P_random desc — top = cut first) ──");
for (const r of rows.filter(r => !r.marquee).sort((a, b) => b.pRandom - a.pRandom))
  console.log(`  ${r.key.padEnd(11)} P_random ${(Math.round(r.pRandom * 1000) / 10 + "%").padStart(7)}  P_best ${(Math.round(r.pBest * 1000) / 10 + "%").padStart(7)}  ${r.verdict}`);

#!/usr/bin/env node
/**
 * bossVarianceCert.ts — Step 5: variance certification for the locked bank.
 *
 * For every locked bank boss (with the curated five-overrides applied), dumps:
 *  - per-starter qualifying-game (min≥10) FP distribution: n, mean, std-dev, IQR
 *    (p25/p75), min/max — via the ONE canonical path (gamePools from bossData).
 *  - the TEAM ROLL-TOTAL distribution and where it sits vs band [132.0,159.6]:
 *    mean, std-dev, IQR, and the below/in/above-band fractions.
 *
 * Count: 36 active bank bosses = 31 unchanged + 5 override-applied (GSW-1718, DAL-1011,
 * PHI-1819, HOU-1920), flagged. Reviewable dump → boss_gen/variance_cert_v3.{json,txt}.
 *
 * Run:  npx tsx basketball/src/tools/bossVarianceCert.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadBankBosses, rollDistribution, P_LO, P_HI } from "./bossGenerator";
import { loadBand, REPO } from "./bossData";

const OVERRIDDEN = new Set(["GSW-1718", "DAL-1011", "PHI-1819", "HOU-1920", "DEN-0607"]);
const r1 = (x: number) => Math.round(x * 10) / 10;

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const q = (p: number) => s[Math.min(n - 1, Math.max(0, Math.floor((p / 100) * n)))];
  const p25 = q(25), p75 = q(75);
  return { n, mean: r1(mean), std: r1(std), p25: r1(p25), p75: r1(p75), iqr: r1(p75 - p25), min: r1(s[0]), max: r1(s[n - 1]) };
}

const bosses = loadBankBosses();
const band = loadBand(P_LO, P_HI);
const BAND: [number, number] = [band.lo, band.hi];

const rows = bosses.map(b => {
  const d = rollDistribution(b, BAND, 6000);
  const below = d.totals.filter(t => t < BAND[0]).length / d.totals.length;
  const inBand = d.totals.filter(t => t >= BAND[0] && t <= BAND[1]).length / d.totals.length;
  const above = d.totals.filter(t => t > BAND[1]).length / d.totals.length;
  return {
    key: b.key, display: b.display, tier: b.tier, overridden: OVERRIDDEN.has(b.key),
    expected: b.expected,
    starters: b.starters.map(s => ({ name: s.name, pos: s.pos, ...stats(s.gamePool) })),
    teamTotalVsBand: {
      ...stats(d.totals),
      band: [r1(BAND[0]), r1(BAND[1])],
      belowPct: r1(below * 100), inBandPct: r1(inBand * 100), abovePct: r1(above * 100),
    },
  };
});

const summary = {
  bankVersion: JSON.parse(fs.readFileSync(path.resolve(REPO, "docs/boss-bank-v1.json"), "utf8"))._meta?.version,
  band: { p_lo: P_LO, p_hi: P_HI, lo: r1(BAND[0]), hi: r1(BAND[1]) },
  count: { total: bosses.length, overridden: rows.filter(r => r.overridden).length, unchanged: rows.filter(r => !r.overridden).length },
  fpPath: "canonicalFp (computeBasketballFp + computeBasketballBadges, _position) — one path",
};

const OUT_JSON = path.resolve(REPO, "boss_gen/variance_cert_v3.json");
const OUT_TXT = path.resolve(REPO, "boss_gen/variance_cert_v3.txt");
fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, rows }, null, 2));

const L: string[] = [];
L.push("BOSS VARIANCE CERT v3");
L.push("=".repeat(96));
L.push(`bank ${summary.bankVersion} | band [${summary.band.lo},${summary.band.hi}] | ${summary.count.total} bosses = ${summary.count.unchanged} unchanged + ${summary.count.overridden} override-applied | FP: one canonical path`);
L.push("");
for (const r of [...rows].sort((a, b) => b.expected - a.expected)) {
  L.push(`${r.key}  "${r.display}"  [${r.tier}]  expected ${r.expected}${r.overridden ? "  ★OVERRIDE-APPLIED" : ""}`);
  L.push(`   starter                 pos   n   mean   std    IQR   (p25–p75)     min/max`);
  for (const s of r.starters) {
    L.push(`   ${s.name.padEnd(22)} ${s.pos.padEnd(4)} ${String(s.n).padStart(3)} ${String(s.mean).padStart(6)} ${String(s.std).padStart(6)} ${String(s.iqr).padStart(6)}   (${s.p25}–${s.p75})`.padEnd(78) + `${s.min}/${s.max}`);
  }
  const t = r.teamTotalVsBand;
  L.push(`   TEAM ROLL TOTAL: mean ${t.mean} std ${t.std} IQR ${t.iqr} (${t.p25}–${t.p75}) range ${t.min}/${t.max}`);
  L.push(`   vs band [${t.band[0]},${t.band[1]}]: below ${t.belowPct}% | in-band ${t.inBandPct}% | above ${t.abovePct}%`);
  L.push("");
}
fs.writeFileSync(OUT_TXT, L.join("\n") + "\n");

console.log(L.slice(0, 3).join("\n"));
console.log(`\nwrote ${OUT_JSON}\nwrote ${OUT_TXT}`);

#!/usr/bin/env node
/**
 * bossTable.ts — Step 1: the 30×29 validation table.
 *
 * Thin layer over bossData.ts (the shared selection + FP substrate — ONE path
 * with the Step-2 generator and the player lineup). Routes each team-season by
 * the INTERIM expected-vs-band rule (Step 2 re-routes by the rejection-sampled
 * roll) and joins the curated bank on (season_code, team_code).
 *
 * Run:  npx tsx basketball/src/tools/bossTable.ts
 *   (band: DUMP_ALLFPS=boss_gen/player_band_allfps.json npx tsx shared/tools/runSimulator.ts basketball 10000)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildAll, loadBand, listSeasons, THIN_SEASONS, MIN_MINUTES, REPO } from "./bossData";

const OUT_JSON = path.resolve(REPO, "boss_gen/boss_table_v1.json");
const OUT_TXT = path.resolve(REPO, "boss_gen/boss_table_v1.txt");
const BANK_FILE = path.resolve(REPO, "docs/boss-bank-v1.json");
const P_LO = 60, P_HI = 85;

const band = loadBand(P_LO, P_HI);
const BAND: [number, number] = [band.lo, band.hi];

const bank = JSON.parse(fs.readFileSync(BANK_FILE, "utf8"));
const bankByKey = new Map<string, any>();
for (const b of bank.bosses) bankByKey.set(`${b.season_code}|${b.team_code}`, b);

type Starter = { name: string; pos: string; meanFp: number; gp: number; avgMin: number; traded: boolean };
type Row = {
  season: string; team: string; tier: string | null; era_id: string | null;
  display: string | null; flavor: string | null;
  expected: number; route: "daily" | "raid";
  rollDepth: number; startersComplete: boolean; tradedStarter: boolean;
  thin: string | null; starters: Starter[];
};

const rows: Row[] = buildAll().map(ts => {
  const bk = bankByKey.get(`${ts.season}|${ts.team}`) ?? null;
  // Two routes (handicap deleted 2026-06-20: real data falsified defensive-low-FP).
  // INTERIM expected-vs-band; Step 2 re-routes by the rejection-sampled roll.
  const route: Row["route"] = ts.expectedRaw > BAND[1] ? "raid" : "daily";
  return {
    season: ts.season, team: ts.team,
    tier: bk?.tier ?? null, era_id: bk?.era_id ?? null,
    display: bk?.display ?? null, flavor: bk?.flavor ?? null,
    expected: ts.expected, route, rollDepth: ts.rollDepth,
    startersComplete: ts.startersComplete, tradedStarter: ts.tradedStarter, thin: ts.thin,
    starters: ts.starters.map(s => ({ name: s.name, pos: s.pos, meanFp: s.meanFp, gp: s.gp, avgMin: s.avgMin, traded: s.traded })),
  };
});
rows.sort((a, b) => b.expected - a.expected);

// ── Acceptance summary ────────────────────────────────────────────────────────
const seasons = listSeasons();
const champRows = rows.filter(r => r.tier === "champ");
const bankRows = rows.filter(r => r.tier);
const bankKeysSeen = new Set(bankRows.map(r => `${r.season}|${r.team}`));
const bankMisses = bank.bosses.filter((b: any) => !bankKeysSeen.has(`${b.season_code}|${b.team_code}`));
const routeCounts = (sub: Row[]) => ({ daily: sub.filter(r => r.route === "daily").length, raid: sub.filter(r => r.route === "raid").length });

const bankMinExpected = bankRows.length ? Math.min(...bankRows.map(r => r.expected)) : 0;
const trivialFloor = Math.floor(bankMinExpected);
const trivialNonBank = rows.filter(r => !r.tier && r.expected < trivialFloor).length;

const defensiveLow = (bank.bosses as any[]).filter(b => b.defensive_low).map(b => {
  const r = rows.find(x => x.season === b.season_code && x.team === b.team_code);
  return { id: b.id, expected: r?.expected ?? null, route: r?.route ?? "MISSING" };
});

const summary = {
  method: "A: top-5 by avg minutes/game (nominal position = display label only)",
  gpFloor: "~30% of season-length (max raw games-played) per season, applied before ranking",
  minMinutesFilter: { value: MIN_MINUTES, consistentAcross: ["boss table (this)", "band dump (runSimulator DUMP_ALLFPS)", "computeRosterCeiling"] },
  fpPath: "computeBasketballFp + computeBasketballBadges (_position injected) — same as computeRosterCeiling/player lineup",
  band: { p_lo: P_LO, p_hi: P_HI, lo: Math.round(BAND[0] * 10) / 10, hi: Math.round(BAND[1] * 10) / 10, source: "runSimulator allFps (strong-capped, min≥10, seed 42)" },
  seasons: seasons.length,
  teamSeasons: rows.length,
  champRowsPresent: champRows.length,
  bankRowsPresent: bankRows.length,
  bankEntries: bank.bosses.length,
  bankMisses: bankMisses.map((b: any) => b.id),
  routes: "daily | raid (handicap deleted 2026-06-20). INTERIM expected-vs-band; Step 2 re-routes by rejection-sampled roll.",
  routeAll: routeCounts(rows),
  routeBank: routeCounts(bankRows),
  trivialFloor: { value: trivialFloor, note: "general/Tier-B pool only; bank min expected = " + Math.round(bankMinExpected * 10) / 10 + " (all 38 bank ≥ floor)", trivialNonBankCount: trivialNonBank },
  defensiveLow: { note: "annotation only, no routing effect", rows: defensiveLow },
  thinSeasonsPresent: seasons.filter(s => THIN_SEASONS[s]),
};

fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, rows }, null, 2));

// ── Readable table ────────────────────────────────────────────────────────────
const fmt = (r: Row) =>
  `${(r.season).padEnd(5)} ${r.team.padEnd(4)} ${(r.tier ?? "—").padEnd(8)} ${String(r.expected).padStart(7)}  ${r.route.padEnd(8)} depth=${String(r.rollDepth).padStart(2)}` +
  `${r.startersComplete ? "" : " [INCOMPLETE-5]"}${r.tradedStarter ? " [traded]" : ""}${r.thin ? ` [thin:${r.thin}]` : ""}` +
  `${r.display ? `  "${r.display}"` : ""}`;

const lines: string[] = [];
lines.push("BOSS TABLE v1 — Step 1 (30×29 validation)");
lines.push("=".repeat(78));
lines.push(`band P${P_LO}-P${P_HI} = [${summary.band.lo}, ${summary.band.hi}] FP   (${summary.band.source})`);
lines.push(`team-seasons: ${summary.teamSeasons} over ${summary.seasons} seasons   |   bank rows present: ${summary.bankRowsPresent}/${summary.bankEntries} (champ ${summary.champRowsPresent})`);
lines.push(`route (all): daily ${summary.routeAll.daily} / raid ${summary.routeAll.raid}   [INTERIM expected-vs-band; Step 2 re-routes by roll]`);
lines.push(`route (bank): daily ${summary.routeBank.daily} / raid ${summary.routeBank.raid}`);
if (bankMisses.length) lines.push(`bank MISSES (no computed row): ${summary.bankMisses.join(", ")}`);
lines.push("");
lines.push("── CURATED BANK ROWS (by expected FP) ──");
lines.push(`${"szn".padEnd(5)} ${"tm".padEnd(4)} ${"tier".padEnd(8)} ${"exp".padStart(7)}  ${"route".padEnd(8)} depth`);
for (const r of rows.filter(r => r.tier)) lines.push(fmt(r));
lines.push("");
lines.push(`── ALL TEAM-SEASONS (${rows.length}, by expected FP) ──`);
lines.push(`${"szn".padEnd(5)} ${"tm".padEnd(4)} ${"tier".padEnd(8)} ${"exp".padStart(7)}  ${"route".padEnd(8)} depth`);
for (const r of rows) lines.push(fmt(r));
fs.writeFileSync(OUT_TXT, lines.join("\n") + "\n");

console.log(lines.slice(0, 8).join("\n"));
console.log(`\nwrote ${OUT_JSON}\nwrote ${OUT_TXT}`);

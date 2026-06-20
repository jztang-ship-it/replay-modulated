#!/usr/bin/env node
/**
 * bossTable.ts — Step 1 of the boss generator: the 30×29 validation table.
 *
 * For every available team-season, selects 5 nominal starters (most games-played
 * per position, minutes tiebreak), computes each starter's expected (mean) FP via
 * the CANONICAL FP path (computeBasketballFp + computeBasketballBadges — the exact
 * functions the player lineup uses; see computeRosterCeiling), sums to a team
 * expected total, and routes it against the strong-capped player-lineup band
 * (P60–P85 of runSimulator's allFps dump). Joins the curated bank on
 * (season_code, team_code) for tier/name. Emits a ranked JSON + readable table.
 *
 * FP IDENTITY (sacred): boss FP here and player FP both call computeBasketballFp +
 * computeBasketballBadges over RawLog.stats with _position injected. One path.
 *
 * Run:  npx tsx basketball/src/tools/bossTable.ts
 *       (band is read from boss_gen/player_band_allfps.json — produce it via
 *        DUMP_ALLFPS=boss_gen/player_band_allfps.json npx tsx shared/tools/runSimulator.ts basketball 10000)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { computeBasketballFp } from "../adapters/fantasyPoints";
import { computeBasketballBadges } from "../adapters/badges";
import { BasketballSportConfig } from "../adapters/basketballConfig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SEASONS_DIR = path.resolve(REPO, "basketball/public/data/seasons");
const BAND_FILE = path.resolve(REPO, "boss_gen/player_band_allfps.json");
const BANK_FILE = path.resolve(REPO, "docs/boss-bank-v1.json");
const OUT_JSON = path.resolve(REPO, "boss_gen/boss_table_v1.json");
const OUT_TXT = path.resolve(REPO, "boss_gen/boss_table_v1.txt");

const WEIGHTS = BasketballSportConfig.projectionWeights;
const BADGES = (BasketballSportConfig as any).badges ?? [];
const MIN_MINUTES = (BasketballSportConfig as any).historicalLogFilters?.minMinutes ?? 10;
const P_LO = 60, P_HI = 85;

// Data-thin seasons (shortened / disrupted) — per-game design tolerates these but
// roll pools are thinner. Flagged in the output.
const THIN_SEASONS: Record<string, string> = {
  "9899": "lockout (50g)",
  "1112": "lockout (66g)",
  "1920": "bubble/suspended",
  "2021": "compressed (72g)",
};

// ── Canonical per-game FP (mirrors computeRosterCeiling): inject _position,
//    computeBasketballFp + badge bonus. ONE path with the player side. ──────────
function canonicalFp(stats: Record<string, any>, position: string): number {
  const s = { ...stats, _position: position };
  const base = computeBasketballFp(s, WEIGHTS);
  const badgeBonus = computeBasketballBadges(s, BADGES).reduce((a: number, b: any) => a + (b.fp ?? 0), 0);
  return base + badgeBonus;
}

function minutesOf(stats: Record<string, any>): number {
  const mp = stats.mp ?? stats.minutes ?? stats.min ?? stats.MIN ?? stats.minutesPlayed;
  if (mp === undefined || mp === null) return NaN;
  const str = String(mp);
  return str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
}

// A "qualifying" (played) game: positive stats AND ≥ MIN_MINUTES — matches the
// computeRosterCeiling resolve filter. Used for both games-played count and FP mean.
function qualifies(stats: Record<string, any>): boolean {
  const hasPositive = Object.values(stats).some(v => typeof v === "number" && v > 0);
  if (!hasPositive) return false;
  const mins = minutesOf(stats);
  if (Number.isFinite(mins) && mins < MIN_MINUTES) return false;
  return true;
}

function pctile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
}

// ── Load band ────────────────────────────────────────────────────────────────
if (!fs.existsSync(BAND_FILE)) {
  console.error(`[bossTable] band file missing: ${BAND_FILE}\n  produce it:  DUMP_ALLFPS=${BAND_FILE} npx tsx shared/tools/runSimulator.ts basketball 10000`);
  process.exit(1);
}
const bandDump = JSON.parse(fs.readFileSync(BAND_FILE, "utf8"));
const allFps: number[] = (bandDump.allFps as number[]).slice().sort((a, b) => a - b);
const BAND: [number, number] = [pctile(allFps, P_LO), pctile(allFps, P_HI)];

// ── Load bank, index by (season_code, team_code) ──────────────────────────────
const bank = JSON.parse(fs.readFileSync(BANK_FILE, "utf8"));
const bankByKey = new Map<string, any>();
for (const b of bank.bosses) bankByKey.set(`${b.season_code}|${b.team_code}`, b);

// ── Build per-team-season rows ────────────────────────────────────────────────
type Starter = { name: string; pos: string; meanFp: number; gp: number; avgMin: number; traded: boolean };
type Row = {
  season: string; team: string; tier: string | null; era_id: string | null;
  display: string | null; flavor: string | null;
  expected: number; route: "daily" | "raid";
  rollDepth: number; startersComplete: boolean; tradedStarter: boolean;
  thin: string | null; starters: Starter[];
};

const seasons = fs.readdirSync(SEASONS_DIR).filter(s => /^\d{4}$/.test(s)).sort();
const rows: Row[] = [];

for (const season of seasons) {
  const dir = path.join(SEASONS_DIR, season);
  const players: any[] = JSON.parse(fs.readFileSync(path.join(dir, "players.json"), "utf8"));
  const logs: any[] = JSON.parse(fs.readFileSync(path.join(dir, "gamelogs.json"), "utf8"));

  // Per-player: qualifying games (min≥10, full-season pool, basePlayerId keyed)
  // AND a raw game count (no min filter) used only as the season-length proxy.
  const gamesByPlayer = new Map<string, Record<string, any>[]>();
  const rawCount = new Map<string, number>();
  for (const l of logs) {
    const id = String(l.basePlayerId ?? "").trim();
    if (!id) continue;
    rawCount.set(id, (rawCount.get(id) ?? 0) + 1);
    const stats = l.stats ?? {};
    if (!qualifies(stats)) continue;
    (gamesByPlayer.get(id) ?? gamesByPlayer.set(id, []).get(id)!).push(stats);
  }

  // Season-length-aware games-played floor: ~30% of scheduled games. Scheduled
  // games proxied by the season's max raw games-played (82 standard; lower in
  // lockout 9899/1112 and bubble/compressed 1920/2021 — so the floor scales down
  // and doesn't over-reject thin-season starters).
  const scheduled = Math.max(0, ...[...rawCount.values()]);
  const GP_FLOOR = Math.round(0.30 * scheduled);

  // Per-player stat over qualifying games.
  const stat = new Map<string, { meanFp: number; gp: number; avgMin: number }>();
  for (const p of players) {
    const id = String(p.basePlayerId ?? "").trim();
    const games = gamesByPlayer.get(id) ?? [];
    if (!games.length) continue;
    const pos = String(p.position ?? "").toUpperCase();
    const fps = games.map(s => canonicalFp(s, pos));
    const mins = games.map(minutesOf).filter(Number.isFinite) as number[];
    stat.set(id, {
      meanFp: fps.reduce((a, b) => a + b, 0) / fps.length,
      gp: games.length,
      avgMin: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0,
    });
  }

  // Team set = every team appearing as a player's primary `team` OR in `teams[]`
  // (so a traded player is a candidate for each stint's team — full-season pool,
  // flagged). Players keyed by basePlayerId; first occurrence wins for identity.
  const playerById = new Map<string, any>();
  const teamCandidates = new Map<string, Set<string>>();
  for (const p of players) {
    const id = String(p.basePlayerId ?? "").trim();
    if (!id) continue;
    if (!playerById.has(id)) playerById.set(id, p);
    const teams = new Set<string>([String(p.team ?? "").trim(), ...((p.teams ?? []).map((t: any) => String(t).trim()))]);
    for (const t of teams) {
      if (!t) continue;
      (teamCandidates.get(t) ?? teamCandidates.set(t, new Set()).get(t)!).add(id);
    }
  }

  for (const [team, candIds] of teamCandidates) {
    // Method A: top-5 by avg minutes/game (nominal position is a display label
    // only), among candidates who clear the games-played floor. Tiebreak: more
    // qualifying games. Captures the authentic five from this data (coarse
    // single-position field can't — see Step-1 findings); minutes is the best
    // starter signal given games-started is absent from the box scores.
    const ranked = [...candIds]
      .filter(id => { const s = stat.get(id); return s && s.gp >= GP_FLOOR; })
      .sort((a, b) => { const sa = stat.get(a)!, sb = stat.get(b)!; return sb.avgMin - sa.avgMin || sb.gp - sa.gp; })
      .slice(0, 5);
    const starters: Starter[] = ranked.map(id => {
      const p = playerById.get(id); const st = stat.get(id)!;
      return {
        name: String(p.name ?? ""), pos: String(p.position ?? "").toUpperCase(),
        meanFp: st.meanFp, gp: st.gp, avgMin: st.avgMin,
        traded: Array.isArray(p.teams) && p.teams.length > 1,
      };
    });

    if (starters.length === 0) continue; // not a real team-season

    const expected = starters.reduce((a, s) => a + s.meanFp, 0);
    const rollDepth = Math.min(...starters.map(s => s.gp));
    // Two routes (handicap deleted 2026-06-20: real data falsified defensive-low-FP
    // — DET-0304=152.6, MEM-1213=151.7 land mid-band because FP rewards reb/stocks).
    // Below-band teams (incl. SAS-1314 128.9) are daily; only above-P85 is raid.
    // NOTE: this is the INTERIM expected-vs-band route. Step 2 re-routes by the
    // rejection-sampled roll (high-expected teams roll weaker games into band →
    // daily; only floor-above-P85 are true raids).
    const route: Row["route"] = expected > BAND[1] ? "raid" : "daily";
    const bk = bankByKey.get(`${season}|${team}`) ?? null;
    rows.push({
      season, team,
      tier: bk?.tier ?? null, era_id: bk?.era_id ?? null,
      display: bk?.display ?? null, flavor: bk?.flavor ?? null,
      expected: Math.round(expected * 10) / 10,
      route, rollDepth, startersComplete: starters.length === 5,
      tradedStarter: starters.some(s => s.traded),
      thin: THIN_SEASONS[season] ?? null,
      starters,
    });
  }
}

rows.sort((a, b) => b.expected - a.expected);

// ── Acceptance summary ────────────────────────────────────────────────────────
const champRows = rows.filter(r => r.tier === "champ");
const bankRows = rows.filter(r => r.tier);
const bankKeysSeen = new Set(bankRows.map(r => `${r.season}|${r.team}`));
const bankMisses = bank.bosses.filter((b: any) => !bankKeysSeen.has(`${b.season_code}|${b.team_code}`));
const routeCounts = (sub: Row[]) => ({
  daily: sub.filter(r => r.route === "daily").length,
  raid: sub.filter(r => r.route === "raid").length,
});

// Trivial-boss floor — general/Tier-B pool ONLY (Tier-B off in v1). Set below the
// bank minimum so all 38 bank rows are daily-eligible; non-bank teams under it are
// "trivial" (excluded from the general daily pool, not a route). Annotation here;
// pool gating is Step 2.
const bankMinExpected = bankRows.length ? Math.min(...bankRows.map(r => r.expected)) : 0;
const trivialFloor = Math.floor(bankMinExpected); // < every bank expected
const trivialNonBank = rows.filter(r => !r.tier && r.expected < trivialFloor).length;

// Sanity: where do the bank's defensive_low hints actually route? (Brief expects
// handicap; with real FP they may land at the low end of daily — recorded here.)
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

// ── Readable table (bank-joined rows first, then the full ranked list) ────────
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
const txt = lines.join("\n") + "\n";
fs.writeFileSync(OUT_TXT, txt);

// ── Console ───────────────────────────────────────────────────────────────────
console.log(lines.slice(0, 8).join("\n"));
console.log(`\nwrote ${OUT_JSON}\nwrote ${OUT_TXT}`);

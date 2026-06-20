#!/usr/bin/env node
/**
 * bossGenerator.ts — Step 2 generator core (real data), mirrors the prototype.
 *
 * Pure, testable exports (seededRng / rollBoss / scheduleHeadline / rollDistribution)
 * + a guarded main() that builds the bank bosses from bossData and writes the
 * Step-2 checkpoint. Tests import the pure functions with synthetic bosses; main()
 * wires the live substrate.
 *
 *   - deterministic seed: sha256(date+slot+team+attempt) → mulberry32 stream
 *   - game-roll: one random qualifying (min≥10) game per starter, RS-only
 *   - ROLL-TARGET PER SLOT: daily → reject toward [P60,P85]; raid → toward ≥P85,
 *     capped by team ceiling (computeRosterCeiling = eligibility + physical cap,
 *     NEVER the target). daily/raid capability is emergent from the sampler.
 *   - rejection sampling K=15 (advance PRNG). HEADLINE NEVER SWAPS: a daily slot
 *     that can't hit band within K → easiest roll + TOUGH-DAY flag. (1−daily_hit)^15
 *     makes even an 18%-daily-hit elite a ~5% tough-day rarity.
 *   - schedule: {champ,iconic}, weighted champ 1.0/iconic 0.6, era_id anti-repeat
 *     cooldown=5d. naming from the bank.
 *
 * Run:  npx tsx basketball/src/tools/bossGenerator.ts   (writes the checkpoint)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildAll, loadBand, REPO, type TeamSeason, type OverrideMap } from "./bossData";

export const K = 15;
export const COOLDOWN = 5;
export const P_LO = 60, P_HI = 85;

export type Boss = TeamSeason & { key: string; tier: string; era_id: string; display: string; flavor: string };
export type RollMode = "daily" | "raid";
export type Roll = {
  status: "in_band" | "raid" | "tough_day" | "out_of_band";
  total: number; picks: { name: string; pos: string; gi: number; fp: number }[]; attempts: number;
};

// ── Deterministic PRNG: same key string → same stream, everywhere. ─────────────
export function seededRng(...parts: (string | number)[]): () => number {
  const h = createHash("sha256").update(parts.map(String).join("|")).digest("hex");
  let a = parseInt(h.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One random qualifying game per starter (deterministic by day+slot+team+attempt).
export function rollGames(b: Boss, day: string, slot: number, attempt: number) {
  const rng = seededRng("roll", day, slot, b.key, attempt);
  const picks = b.starters.map(s => {
    const gi = Math.floor(rng() * s.gamePool.length);
    return { name: s.name, pos: s.pos, gi, fp: s.gamePool[gi] };
  });
  return { picks, total: picks.reduce((a, p) => a + p.fp, 0) };
}

// Deterministic rejection sampling toward the slot's roll-target.
export function rollBoss(b: Boss, day: string, slot: number, mode: RollMode, band: [number, number], k = K): Roll {
  const accept = (t: number) => mode === "daily" ? (t >= band[0] && t <= band[1]) : t >= band[1];
  const all: { picks: Roll["picks"]; total: number }[] = [];
  for (let attempt = 0; attempt < k; attempt++) {
    const r = rollGames(b, day, slot, attempt);
    all.push(r);
    if (accept(r.total)) return { status: mode === "daily" ? "in_band" : "raid", total: r.total, picks: r.picks, attempts: attempt + 1 };
  }
  // HEADLINE NEVER SWAPS. Daily best-effort: easiest roll (min total) + tough-day
  // flag — whether structural (floor>band) or stochastic (low-daily-hit, missed K).
  if (mode === "daily") {
    const easiest = all.reduce((m, r) => r.total < m.total ? r : m);
    return { status: "tough_day", total: easiest.total, picks: easiest.picks, attempts: k };
  }
  const top = all.reduce((m, r) => r.total > m.total ? r : m); // raid: closest to clearing P85
  return { status: "out_of_band", total: top.total, picks: top.picks, attempts: k };
}

// Empirical roll distribution (uniform one-game-per-starter).
export function rollDistribution(b: Boss, band: [number, number], M = 4000) {
  const totals: number[] = [];
  for (let i = 0; i < M; i++) totals.push(rollGames(b, "dist", 0, i).total);
  const dailyHit = totals.filter(t => t >= band[0] && t <= band[1]).length / M;
  const raidHit = totals.filter(t => t >= band[1]).length / M;
  return { totals, dailyHit, raidHit, min: Math.min(...totals), max: Math.max(...totals), mean: totals.reduce((a, b) => a + b, 0) / M };
}

// Headline schedule: weighted, era anti-repeat (cooldown days). Pure over a pool.
export function scheduleHeadline(pool: Boss[], startISO: string, days: number, cooldown = COOLDOWN): { day: string; boss: Boss }[] {
  const out: { day: string; boss: Boss }[] = [];
  const recent: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");
  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
    const eligible = pool.filter(b => !recent.includes(b.era_id));
    const weights = eligible.map(b => b.tier === "champ" ? 1.0 : 0.6);
    const rng = seededRng("sched", day);
    const total = weights.reduce((a, w) => a + w, 0);
    let x = rng() * total, pick = eligible[0];
    for (let i = 0; i < eligible.length; i++) { x -= weights[i]; if (x <= 0) { pick = eligible[i]; break; } }
    out.push({ day, boss: pick });
    recent.push(pick.era_id);
    if (recent.length > cooldown) recent.shift();
  }
  return out;
}

// Build the 38 bank bosses (bank ⨝ bossData).
export function loadBankBosses(): Boss[] {
  const bank = JSON.parse(fs.readFileSync(path.resolve(REPO, "docs/boss-bank-v1.json"), "utf8"));
  // Curated five-overrides → applied at this bank⨝bossData join (identity layer).
  // bossTable.buildAll() runs WITHOUT this map, so the Step-1 selection table is
  // unaffected; only the curated boss identities use the override.
  // ACTIVE bank only (hide-don't-delete: cut identities carry active:false and are
  // excluded here). The 36-identity locked set.
  const active = bank.bosses.filter((b: any) => b.active !== false);
  const overrides: OverrideMap = new Map();
  for (const b of active) if (Array.isArray(b.fiveOverride) && b.fiveOverride.length)
    overrides.set(`${b.season_code}|${b.team_code}`, b.fiveOverride);
  const allTs = new Map<string, TeamSeason>();
  for (const ts of buildAll(overrides)) allTs.set(`${ts.season}|${ts.team}`, ts);
  const out: Boss[] = [];
  for (const b of active) {
    const ts = allTs.get(`${b.season_code}|${b.team_code}`);
    if (!ts) continue;
    out.push({ ...ts, key: b.id, tier: b.tier, era_id: b.era_id, display: b.display, flavor: b.flavor });
  }
  return out;
}

// ── Checkpoint (guarded main) ─────────────────────────────────────────────────
function main() {
  const OUT_JSON = path.resolve(REPO, "boss_gen/step2_checkpoint.json");
  const OUT_TXT = path.resolve(REPO, "boss_gen/step2_checkpoint.txt");
  const bosses = loadBankBosses();
  const band = loadBand(P_LO, P_HI);
  const BAND: [number, number] = [band.lo, band.hi];
  const playerFps = band.allFps;
  const pBeat = (t: number) => playerFps.filter(f => f > t).length / playerFps.length; // P(one player lineup > boss)

  const perBoss = bosses.map(b => {
    const d = rollDistribution(b, BAND);
    return {
      key: b.key, display: b.display, tier: b.tier, era_id: b.era_id,
      expected: b.expected, floor: b.floor, ceiling: b.ceiling, rollDepth: b.rollDepth,
      dailyCapable: d.dailyHit > 0, raidCapable: d.raidHit > 0,
      dailyHitPct: Math.round(d.dailyHit * 1000) / 10, raidHitPct: Math.round(d.raidHit * 1000) / 10,
      toughDayPct: Math.round(Math.pow(1 - d.dailyHit, K) * 1000) / 10, // analytic K-miss rarity
      min: Math.round(d.min * 10) / 10, max: Math.round(d.max * 10) / 10, mean: Math.round(d.mean * 10) / 10,
      toughDayStructural: b.floor > BAND[1], traded: b.tradedStarter, complete5: b.startersComplete, thin: b.thin,
    };
  });

  // (a) split
  const split = {
    dailyCapable: perBoss.filter(b => b.dailyCapable).length,
    raidCapable: perBoss.filter(b => b.raidCapable).length,
    both: perBoss.filter(b => b.dailyCapable && b.raidCapable).length,
    dailyOnly: perBoss.filter(b => b.dailyCapable && !b.raidCapable).length,
    raidOnly: perBoss.filter(b => !b.dailyCapable && b.raidCapable).length,
    neither: perBoss.filter(b => !b.dailyCapable && !b.raidCapable).length,
  };
  // (b) iconic + marquee both-capable
  const both = (keys: string[]) => perBoss.filter(b => keys.length ? keys.includes(b.key) : b.tier === "iconic")
    .map(b => ({ key: b.key, display: b.display, dailyHitPct: b.dailyHitPct, raidHitPct: b.raidHitPct, toughDayPct: b.toughDayPct, both: b.dailyCapable && b.raidCapable }));
  // (c) tough-day: structural (floor>band) AND the K-miss rarity at K=15
  const toughStructural = perBoss.filter(b => b.toughDayStructural).map(b => b.key);
  const worstToughDay = [...perBoss].sort((a, b) => b.toughDayPct - a.toughDayPct).slice(0, 5)
    .map(b => ({ key: b.key, display: b.display, dailyHitPct: b.dailyHitPct, toughDayPct: b.toughDayPct }));
  // (d) per-day win-rate under the 1-hour multi-attempt window (1−(1−p)^N).
  //     N is window-bounded (unlimited attempts within the hour), so report a curve.
  //     The Step-1/early "27%" was N=1 — the wrong denominator (per single player roll).
  const dailyBosses = bosses.filter((_, i) => perBoss[i].dailyCapable);
  const dayTotals: number[] = [];
  for (const b of dailyBosses) for (let dnum = 0; dnum < 14; dnum++) {
    const r = rollBoss(b, `2026-08-${String(dnum + 1).padStart(2, "0")}`, 0, "daily", BAND);
    if (r.status === "in_band") dayTotals.push(r.total);
  }
  const perDayWR = (N: number) => Math.round((dayTotals.reduce((a, t) => a + (1 - Math.pow(1 - pBeat(t), N)), 0) / dayTotals.length) * 1000) / 10;
  const winRate = {
    note: "per-day win = 1−(1−p)^N over the 1-hour replay window (multi-attempt, unlimited within the hour). p = P(one strong player lineup > boss daily roll). For band tuning, not a target.",
    attemptModel: "1-hour replay window (api/challenge/[id]/attempt.ts ONE_HOUR_MS; is_window_open) — multi-attempt, not a fixed count",
    perDayWinPct: { N1: perDayWR(1), N3: perDayWR(3), N5: perDayWR(5), N10: perDayWR(10), N20: perDayWR(20) },
  };

  const dcheck = (() => { const b = bosses[0]; const a = rollBoss(b, "2026-07-01", 0, "daily", BAND).total; const c = rollBoss(b, "2026-07-01", 0, "daily", BAND).total; return { boss: b.key, a, c, pass: a === c }; })();
  const sched = scheduleHeadline(bosses.filter(b => b.tier === "champ" || b.tier === "iconic"), "2026-06-22", 30);
  const schedRows = sched.map(({ day, boss }) => { const r = rollBoss(boss, day, 0, "daily", BAND); return { day, key: boss.key, era_id: boss.era_id, total: Math.round(r.total * 10) / 10, status: r.status, attempts: r.attempts }; });
  const eras = schedRows.map(r => r.era_id);
  const cooldownViolations = eras.map((e, i) => eras.slice(Math.max(0, i - COOLDOWN), i).includes(e) ? i : -1).filter(i => i >= 0);
  const toughDaysInSched = schedRows.filter(r => r.status === "tough_day").length;

  const checkpoint = {
    band: { p_lo: P_LO, p_hi: P_HI, lo: Math.round(BAND[0] * 10) / 10, hi: Math.round(BAND[1] * 10) / 10 },
    K, cooldown: COOLDOWN, bankBosses: bosses.length,
    a_split: split,
    b_iconicBoth: both([]),
    b_marqueeChamps: both(["GSW-1617", "GSW-1516", "CHI-9798", "LAL-0001", "BOS-2324", "DEN-2223"]),
    c_toughDay: { structuralFloorAboveBand: toughStructural, worstKMissRarity: worstToughDay, scheduled30dToughDays: toughDaysInSched },
    d_dailyWinRate: winRate,
    determinism: dcheck,
    schedule30d: { cooldownViolations, toughDays: toughDaysInSched, rows: schedRows },
    perBoss,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(checkpoint, null, 2));

  const L: string[] = [];
  L.push("BOSS GENERATOR — Step 2 core CHECKPOINT (K=" + K + ")");
  L.push("=".repeat(74));
  L.push(`band P${P_LO}-P${P_HI} = [${checkpoint.band.lo}, ${checkpoint.band.hi}]  | K=${K} | cooldown=${COOLDOWN}d | bank=${bosses.length}`);
  L.push(`determinism: ${dcheck.boss} ${dcheck.a} == ${dcheck.c} → ${dcheck.pass ? "PASS" : "FAIL"}`);
  L.push("");
  L.push(`(a) split: daily-capable ${split.dailyCapable}/${bosses.length}  raid-capable ${split.raidCapable}/${bosses.length}  both ${split.both}  neither ${split.neither}`);
  L.push("");
  L.push("(b) iconic super-teams (daily% / raid% / tough-day% @K=15):");
  for (const x of checkpoint.b_iconicBoth) L.push(`    ${x.key.padEnd(9)} daily ${String(x.dailyHitPct).padStart(5)}% raid ${String(x.raidHitPct).padStart(5)}% tough ${String(x.toughDayPct).padStart(4)}%  ${x.both ? "BOTH ✓" : "✗"}  "${x.display}"`);
  L.push("    marquee champs:");
  for (const x of checkpoint.b_marqueeChamps) L.push(`    ${x.key.padEnd(9)} daily ${String(x.dailyHitPct).padStart(5)}% raid ${String(x.raidHitPct).padStart(5)}% tough ${String(x.toughDayPct).padStart(4)}%  ${x.both ? "BOTH ✓" : "✗"}  "${x.display}"`);
  L.push("");
  L.push(`(c) tough-day: structural floor>band = ${toughStructural.length === 0 ? "none" : toughStructural.join(",")}  | worst K-miss rarity @K=15:`);
  for (const x of worstToughDay) L.push(`    ${x.key.padEnd(9)} daily-hit ${String(x.dailyHitPct).padStart(5)}% → tough-day ${x.toughDayPct}%  "${x.display}"`);
  L.push(`    scheduled 30-day tough-days: ${toughDaysInSched}/30 (${Math.round(toughDaysInSched / 30 * 1000) / 10}%)`);
  L.push("");
  L.push("(d) per-day win-rate under the 1-hour multi-attempt window (1−(1−p)^N):");
  L.push(`    attempt model: ${winRate.attemptModel}`);
  L.push(`    N=1 ${winRate.perDayWinPct.N1}%  N=3 ${winRate.perDayWinPct.N3}%  N=5 ${winRate.perDayWinPct.N5}%  N=10 ${winRate.perDayWinPct.N10}%  N=20 ${winRate.perDayWinPct.N20}%`);
  L.push(`    (N=1 is the old single-roll 27% — wrong denominator. Multi-attempt → high per-day WR.)`);
  L.push("");
  L.push(`30-day schedule: cooldown ${cooldownViolations.length === 0 ? "PASS" : "FAIL " + cooldownViolations}  | tough-days ${toughDaysInSched}/30`);
  fs.writeFileSync(OUT_TXT, L.join("\n") + "\n");
  console.log(L.join("\n"));
  console.log(`\nwrote ${OUT_JSON}\nwrote ${OUT_TXT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

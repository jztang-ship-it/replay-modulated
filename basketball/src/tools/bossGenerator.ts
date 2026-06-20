#!/usr/bin/env node
/**
 * bossGenerator.ts — Step 2: generator core (real data), mirrors the prototype.
 *
 *   - deterministic seed: sha256(date+slot+team+attempt) → mulberry32 stream
 *   - game-roll: one random qualifying (min≥10) game per starter, from that
 *     starter's pool, RS-only
 *   - ROLL-TARGET PER SLOT (the locked Step-2 routing — supersedes Step-1's
 *     expected-vs-band):
 *       daily slot → rejection-sample toward [P60,P85] (bias weaker games in-band)
 *       raid  slot → rejection-sample toward total ≥ P85 (upper tail), capped by
 *                    the team ceiling (computeRosterCeiling). Ceiling is the
 *                    eligibility test + physical cap, NEVER the target.
 *     daily/raid CAPABILITY is emergent from the sampler (no separate rule):
 *       daily-capable ⇔ rolls land in band; raid-capable ⇔ rolls reach ≥P85.
 *   - rejection sampling: up to K=8 re-rolls of the GAMES (advance PRNG), then
 *     best-effort. HEADLINE slots NEVER silently swap teams — a scheduled headliner
 *     that can't hit its target is presented at its easiest roll with a tough-day flag.
 *   - schedule: headline from {champ,iconic}, weighted champ 1.0 / iconic 0.6,
 *     no identity-era within cooldown=5 days (era_id is the anti-repeat unit)
 *   - naming: authored display/flavor from the bank
 *
 * Run:  npx tsx basketball/src/tools/bossGenerator.ts   (writes the checkpoint)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { buildAll, loadBand, REPO, type TeamSeason } from "./bossData";

const K = 8, COOLDOWN = 5, P_LO = 60, P_HI = 85;
const BANK_FILE = path.resolve(REPO, "docs/boss-bank-v1.json");
const OUT_JSON = path.resolve(REPO, "boss_gen/step2_checkpoint.json");
const OUT_TXT = path.resolve(REPO, "boss_gen/step2_checkpoint.txt");

// ── Deterministic PRNG: same key string → same stream, everywhere. ─────────────
function seededRng(...parts: (string | number)[]): () => number {
  const h = createHash("sha256").update(parts.map(String).join("|")).digest("hex");
  let a = parseInt(h.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Boss model: a bank TeamSeason + curation. ─────────────────────────────────
type Boss = TeamSeason & { key: string; tier: string; era_id: string; display: string; flavor: string };

const bank = JSON.parse(fs.readFileSync(BANK_FILE, "utf8"));
const bankByKey = new Map<string, any>();
for (const b of bank.bosses) bankByKey.set(`${b.season_code}|${b.team_code}`, b);

const allTs = new Map<string, TeamSeason>();
for (const ts of buildAll()) allTs.set(`${ts.season}|${ts.team}`, ts);

const bosses: Boss[] = [];
for (const b of bank.bosses) {
  const ts = allTs.get(`${b.season_code}|${b.team_code}`);
  if (!ts) continue; // (none — bank 38/38 present)
  bosses.push({ ...ts, key: b.id, tier: b.tier, era_id: b.era_id, display: b.display, flavor: b.flavor });
}

const band = loadBand(P_LO, P_HI);
const BAND: [number, number] = [band.lo, band.hi];

// ── Roll one boss with deterministic rejection sampling toward a slot target. ──
type RollMode = "daily" | "raid";
type Roll = { status: "in_band" | "raid" | "tough_day" | "out_of_band"; total: number; picks: { name: string; pos: string; gi: number; fp: number }[]; attempts: number };

function rollGames(b: Boss, day: string, slot: number, attempt: number) {
  const rng = seededRng("roll", day, slot, b.key, attempt);
  const picks = b.starters.map(s => {
    const gi = Math.floor(rng() * s.gamePool.length);
    return { name: s.name, pos: s.pos, gi, fp: s.gamePool[gi] };
  });
  return { picks, total: picks.reduce((a, p) => a + p.fp, 0) };
}

function rollBoss(b: Boss, day: string, slot: number, mode: RollMode): Roll {
  const accept = (t: number) => mode === "daily" ? (t >= BAND[0] && t <= BAND[1]) : t >= BAND[1];
  const all: { picks: any[]; total: number }[] = [];
  for (let attempt = 0; attempt < K; attempt++) {
    const r = rollGames(b, day, slot, attempt);
    all.push(r);
    if (accept(r.total)) return { status: mode === "daily" ? "in_band" : "raid", total: r.total, picks: r.picks, attempts: attempt + 1 };
  }
  // Best-effort. HEADLINE NEVER SWAPS: a daily slot that can't land in band within
  // K rolls — whether structurally (floor > band) or stochastically (a low-daily-hit
  // team that missed all K this day) — is presented at its EASIEST roll (min total)
  // and flagged TOUGH DAY. One unified rule, matching "easiest roll + tough-day flag."
  if (mode === "daily") {
    const easiest = all.reduce((m, r) => r.total < m.total ? r : m);
    return { status: "tough_day", total: easiest.total, picks: easiest.picks, attempts: K };
  }
  const top = all.reduce((m, r) => r.total > m.total ? r : m); // raid: closest to clearing P85
  return { status: "out_of_band", total: top.total, picks: top.picks, attempts: K };
}

// ── Headline schedule: weighted, era anti-repeat (cooldown days). ─────────────
function scheduleHeadline(startISO: string, days: number, cooldown = COOLDOWN): { day: string; boss: Boss }[] {
  const pool = bosses.filter(b => b.tier === "champ" || b.tier === "iconic");
  const out: { day: string; boss: Boss }[] = [];
  const recent: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");
  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
    const eligible = pool.filter(b => !recent.includes(b.era_id));
    const weights = eligible.map(b => b.tier === "champ" ? 1.0 : 0.6);
    const rng = seededRng("sched", day);
    // weighted pick
    const total = weights.reduce((a, w) => a + w, 0);
    let x = rng() * total, pick = eligible[0];
    for (let i = 0; i < eligible.length; i++) { x -= weights[i]; if (x <= 0) { pick = eligible[i]; break; } }
    out.push({ day, boss: pick });
    recent.push(pick.era_id);
    if (recent.length > cooldown) recent.shift();
  }
  return out;
}

// ── Empirical per-boss roll distribution (uniform one-game-per-starter). ───────
function rollDistribution(b: Boss, M = 4000): { totals: number[]; dailyHit: number; raidHit: number; min: number; max: number; mean: number } {
  const totals: number[] = [];
  for (let i = 0; i < M; i++) totals.push(rollGames(b, "dist", 0, i).total);
  const dailyHit = totals.filter(t => t >= BAND[0] && t <= BAND[1]).length / M;
  const raidHit = totals.filter(t => t >= BAND[1]).length / M;
  return { totals, dailyHit, raidHit, min: Math.min(...totals), max: Math.max(...totals), mean: totals.reduce((a, b) => a + b, 0) / M };
}

// ── Checkpoint analysis (a)–(d). ──────────────────────────────────────────────
const playerFps = band.allFps; // strong-capped player-lineup totals (the field)
const winRateVs = (bossTotal: number) => playerFps.filter(f => f > bossTotal).length / playerFps.length;

const perBoss = bosses.map(b => {
  const d = rollDistribution(b);
  return {
    key: b.key, display: b.display, tier: b.tier, era_id: b.era_id,
    expected: b.expected, floor: b.floor, ceiling: b.ceiling, rollDepth: b.rollDepth,
    dailyCapable: d.dailyHit > 0, raidCapable: d.raidHit > 0,
    dailyHitPct: Math.round(d.dailyHit * 1000) / 10, raidHitPct: Math.round(d.raidHit * 1000) / 10,
    min: Math.round(d.min * 10) / 10, max: Math.round(d.max * 10) / 10, mean: Math.round(d.mean * 10) / 10,
    toughDay: b.floor > BAND[1], traded: b.tradedStarter, complete5: b.startersComplete, thin: b.thin,
  };
});

// (a) corrected daily/raid split from real roll distributions
const split = {
  dailyCapable: perBoss.filter(b => b.dailyCapable).length,
  raidCapable: perBoss.filter(b => b.raidCapable).length,
  both: perBoss.filter(b => b.dailyCapable && b.raidCapable).length,
  dailyOnly: perBoss.filter(b => b.dailyCapable && !b.raidCapable).length,
  raidOnly: perBoss.filter(b => !b.dailyCapable && b.raidCapable).length,
  neither: perBoss.filter(b => !b.dailyCapable && !b.raidCapable).length,
};

// (b) iconic super-teams both daily- AND raid-capable
const iconicBoth = perBoss.filter(b => b.tier === "iconic").map(b => ({ key: b.key, display: b.display, dailyHitPct: b.dailyHitPct, raidHitPct: b.raidHitPct, both: b.dailyCapable && b.raidCapable }));
const marqueeChamps = perBoss.filter(b => ["GSW-1617", "GSW-1516", "CHI-9798", "LAL-0001", "BOS-2324", "DEN-2223"].includes(b.key))
  .map(b => ({ key: b.key, display: b.display, dailyHitPct: b.dailyHitPct, raidHitPct: b.raidHitPct, both: b.dailyCapable && b.raidCapable }));

// (c) floor exceeds band → tough-day-flag case
const toughDay = perBoss.filter(b => b.toughDay).map(b => ({ key: b.key, display: b.display, floor: b.floor, bandHi: Math.round(BAND[1] * 10) / 10 }));

// (d) rough daily win-rate at one roll vs a few (boss restock over N days)
const dailyTeams = perBoss.filter(b => b.dailyCapable);
const oneRollWR: number[] = [], fewRollWR: number[] = [];
for (const pb of dailyTeams) {
  const b = bosses.find(x => x.key === pb.key)!;
  const dayRolls: number[] = [];
  for (let dnum = 0; dnum < 7; dnum++) {
    const r = rollBoss(b, `2026-07-${String(dnum + 1).padStart(2, "0")}`, 0, "daily");
    dayRolls.push(r.total);
  }
  oneRollWR.push(winRateVs(dayRolls[0]));                                  // single day
  fewRollWR.push(dayRolls.reduce((a, t) => a + winRateVs(t), 0) / dayRolls.length); // 7-day mean
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const winRate = {
  note: "player win-rate = frac of strong-capped player lineups exceeding the boss daily roll. Rough — for later band tuning, NOT a target.",
  oneRoll_meanWinPct: Math.round(mean(oneRollWR) * 1000) / 10,
  fewRoll7d_meanWinPct: Math.round(mean(fewRollWR) * 1000) / 10,
};

// determinism self-check
const dcheck = (() => {
  const b = bosses[0];
  const a = rollBoss(b, "2026-07-01", 0, "daily").total;
  const c = rollBoss(b, "2026-07-01", 0, "daily").total;
  return { boss: b.key, a, c, pass: a === c };
})();

// sample 14-day schedule + cooldown invariant + tough-day presentation
const sched = scheduleHeadline("2026-06-22", 14);
const schedRows = sched.map(({ day, boss }) => {
  const r = rollBoss(boss, day, 0, "daily");
  return { day, key: boss.key, display: boss.display, era_id: boss.era_id, total: Math.round(r.total * 10) / 10, status: r.status, attempts: r.attempts, toughDayFlag: r.status === "tough_day" };
});
const eras = schedRows.map(r => r.era_id);
const cooldownViolations = eras.map((e, i) => eras.slice(Math.max(0, i - COOLDOWN), i).includes(e) ? i : -1).filter(i => i >= 0);

const checkpoint = {
  band: { p_lo: P_LO, p_hi: P_HI, lo: Math.round(BAND[0] * 10) / 10, hi: Math.round(BAND[1] * 10) / 10 },
  K, cooldown: COOLDOWN, bankBosses: bosses.length,
  a_split: split,
  b_iconicBoth: iconicBoth,
  b_marqueeChamps: marqueeChamps,
  c_toughDay: toughDay,
  d_dailyWinRate: winRate,
  determinism: dcheck,
  schedule14d: { cooldownViolations, rows: schedRows },
  perBoss,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(checkpoint, null, 2));

// ── Readable checkpoint ───────────────────────────────────────────────────────
const L: string[] = [];
L.push("BOSS GENERATOR — Step 2 core CHECKPOINT");
L.push("=".repeat(74));
L.push(`band P${P_LO}-P${P_HI} = [${checkpoint.band.lo}, ${checkpoint.band.hi}]  | K=${K} reject | cooldown=${COOLDOWN}d | bank bosses=${bosses.length}`);
L.push(`determinism: ${dcheck.boss} ${dcheck.a} == ${dcheck.c} → ${dcheck.pass ? "PASS" : "FAIL"}`);
L.push("");
L.push("(a) DAILY/RAID SPLIT from real roll distributions:");
L.push(`    daily-capable ${split.dailyCapable}/${bosses.length}   raid-capable ${split.raidCapable}/${bosses.length}   both ${split.both}   daily-only ${split.dailyOnly}   raid-only ${split.raidOnly}   neither ${split.neither}`);
L.push("");
L.push("(b) ICONIC super-teams — daily AND raid capable?");
for (const x of iconicBoth) L.push(`    ${x.key.padEnd(9)} daily ${String(x.dailyHitPct).padStart(5)}% / raid ${String(x.raidHitPct).padStart(5)}%  ${x.both ? "BOTH ✓" : "NOT BOTH ✗"}  "${x.display}"`);
L.push("    marquee champs:");
for (const x of marqueeChamps) L.push(`    ${x.key.padEnd(9)} daily ${String(x.dailyHitPct).padStart(5)}% / raid ${String(x.raidHitPct).padStart(5)}%  ${x.both ? "BOTH ✓" : "NOT BOTH ✗"}  "${x.display}"`);
L.push("");
L.push(`(c) FLOOR > BAND (tough-day-flag case): ${toughDay.length === 0 ? "none" : ""}`);
for (const x of toughDay) L.push(`    ${x.key} floor ${x.floor} > P85 ${x.bandHi}  "${x.display}"`);
L.push("");
L.push("(d) ROUGH daily win-rate (player beats boss daily roll):");
L.push(`    one-roll mean ${winRate.oneRoll_meanWinPct}%   |   7-day-restock mean ${winRate.fewRoll7d_meanWinPct}%   (for band tuning, not a target)`);
L.push("");
L.push(`14-DAY HEADLINE SCHEDULE (cooldown invariant: ${cooldownViolations.length === 0 ? "PASS" : "FAIL " + cooldownViolations}):`);
for (const r of schedRows) L.push(`    ${r.day}  ${r.key.padEnd(9)} total ${String(r.total).padStart(6)}  ${r.status.padEnd(11)} ${r.attempts} roll(s)${r.toughDayFlag ? "  ⚠ TOUGH DAY" : ""}  [${r.era_id}]`);
L.push("");
L.push("perBoss roll distribution (by expected):");
L.push(`${"key".padEnd(9)} ${"tier".padEnd(7)} ${"exp".padStart(6)} ${"floor".padStart(6)} ${"ceil".padStart(6)}  ${"dailyHit".padStart(8)} ${"raidHit".padStart(7)}`);
for (const b of [...perBoss].sort((a, b) => b.expected - a.expected)) {
  L.push(`${b.key.padEnd(9)} ${b.tier.padEnd(7)} ${String(b.expected).padStart(6)} ${String(b.floor).padStart(6)} ${String(b.ceiling).padStart(6)}  ${String(b.dailyHitPct).padStart(7)}% ${String(b.raidHitPct).padStart(6)}%${b.toughDay ? " TOUGH" : ""}`);
}
fs.writeFileSync(OUT_TXT, L.join("\n") + "\n");

console.log(L.slice(0, 18).join("\n"));
console.log(`\nwrote ${OUT_JSON}\nwrote ${OUT_TXT}`);

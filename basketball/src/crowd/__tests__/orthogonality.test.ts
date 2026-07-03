// basketball/src/crowd/__tests__/orthogonality.test.ts — PHASE 2, TEST-ONLY.
//
// The GUARDRAIL that keeps the crowd independent of value. It READS the frozen
// crowd model AND the real value engine (for parity) to MEASURE independence.
// It never wires one into the other — that separation is exactly what it protects.
//
// The crowd model is FROZEN. If a gate here fails, that is a real finding to
// diagnose — NOT a number to fix by re-tuning the crowd. Tuning the model to pass
// its own independence test reintroduces value through our hands.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { basketballCrowdOwnership, buildBasketballCrowdSignals, type CrowdPlayer, type CrowdLog } from "../basketballCrowd";
// value engine — read-only here (parity resolution + projections).
import { computeBasketballFp } from "../../adapters/fantasyPoints";
import { computeBasketballBadges } from "../../adapters/badges";
import { BasketballSportConfig } from "../../adapters/basketballConfig";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEIGHTS = (BasketballSportConfig as any).projectionWeights;
const BADGES = (BasketballSportConfig as any).badges;
const score = (sl: Record<string, number>): number =>
  computeBasketballFp(sl, WEIGHTS) + (computeBasketballBadges(sl, BADGES) as any[]).reduce((a, b) => a + (b.fp ?? 0), 0);
// engine parity — same known FTUE-baked values as the crowd/sim harness
if (Math.abs(score({ pts: 33, reb: 13, ast: 5, stl: 2, blk: 0, turnovers: 3 } as any) - 64.1) > 0.05) throw new Error("parity");

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface PoolPlayer { id: string; salary: number; projectedFp: number; efficiency: number; effReal: number; logFps: number[]; ownership: number; fame: number; recency: number; market: number; position: number; }
function loadPool(season: string): PoolPlayer[] {
  const dir = resolve(__dirname, `../../../public/data/seasons/${season}`);
  const prows = JSON.parse(readFileSync(resolve(dir, "players.json"), "utf8")) as any[];
  const glogs = JSON.parse(readFileSync(resolve(dir, "gamelogs.json"), "utf8")) as any[];
  const allByBid = new Map<string, CrowdLog[]>();   // ALL logs → crowd recency (matches the frozen model's usage)
  const fpByBid = new Map<string, number[]>();        // valid (min>=10, positive) scored fp → value resolution
  for (const e of glogs) {
    const s = e.stats || {}; const id = String(e.basePlayerId);
    if (!allByBid.has(id)) allByBid.set(id, []); allByBid.get(id)!.push({ stats: s });
    if (Number(s.min ?? 0) >= 10 && ["pts", "reb", "ast", "stl", "blk"].some((k) => Number(s[k] ?? 0) > 0)) {
      if (!fpByBid.has(id)) fpByBid.set(id, []); fpByBid.get(id)!.push(score(s));
    }
  }
  const cp: CrowdPlayer[] = prows.map((p) => ({ basePlayerId: String(p.basePlayerId), name: p.name, team: p.team, position: p.position }));
  const own = basketballCrowdOwnership(cp, allByBid);
  const sig = buildBasketballCrowdSignals(cp, allByBid);
  return prows
    .filter((p) => p.salary != null && p.projectedFp != null && (fpByBid.get(String(p.basePlayerId))?.length ?? 0) >= 20)
    .map((p) => { const id = String(p.basePlayerId); const s = sig.get(id)!; const lf = fpByBid.get(id)!;
      // effReal = realized-log-mean per dollar — the value axis the engine-parity
      // harness (v1/v2 skill-vs-luck) uses and the one that actually separates.
      return { id, salary: Number(p.salary), projectedFp: Number(p.projectedFp), efficiency: Number(p.projectedFp) / Number(p.salary),
        effReal: mean(lf) / Number(p.salary), logFps: lf, ownership: own.get(id)!, fame: s.fame, recency: s.recency, market: s.market, position: s.position }; });
}

const POOLS: Record<string, PoolPlayer[]> = { "2425": loadPool("2425"), "2526": loadPool("2526") };

// ── 1. CORRELATION DIAGNOSTIC ───────────────────────────────────────────────
describe("orthogonality — crowd ownership vs the value axis", () => {
  for (const season of Object.keys(POOLS)) {
    const P = POOLS[season];
    const own = P.map((p) => p.ownership), eff = P.map((p) => p.efficiency), proj = P.map((p) => p.projectedFp);
    const rEff = pearson(own, eff), rProj = pearson(own, proj);
    it(`[${season}] PRIMARY GATE: |r(ownership, efficiency)| < 0.15  (n=${P.length})`, () => {
      // eslint-disable-next-line no-console
      console.log(`\n── ORTHOGONALITY [${season}] n=${P.length} ──`);
      console.log(`  PRIMARY  r(ownership, efficiency=projFp/salary) = ${rEff.toFixed(3)}   [gate |r|<0.15]`);
      console.log(`  diag     r(ownership, raw projFp)               = ${rProj.toFixed(3)}   [expect mild+, not asserted]`);
      console.log(`  per-signal vs efficiency:`);
      for (const [k, xs] of [["fame", P.map((p) => p.fame)], ["market", P.map((p) => p.market)], ["recency", P.map((p) => p.recency)], ["position", P.map((p) => p.position)]] as [string, number[]][])
        console.log(`     r(${k.padEnd(8)}, efficiency) = ${pearson(xs, eff).toFixed(3)}`);
      expect(Math.abs(rEff)).toBeLessThan(0.15);
    });
  }
});

// ── 2. BASELINE SIM (the real verdict) ──────────────────────────────────────
describe("orthogonality — baseline sim: crowd-following must NOT beat random; value must beat crowd", () => {
  const pool = POOLS["2425"]; const N = 4000; const CAP = 250, MIN = 239, RS = 5, MR = 3;
  const medReal = median(pool.map((p) => p.effReal));      // realized-mean value axis (the harness's)
  const medProj = median(pool.map((p) => p.efficiency));   // projectedFp axis — diagnostic only
  const medOwn = median(pool.map((p) => p.ownership));
  const pick = (rnd: () => number, need: number, ex: PoolPlayer[]): PoolPlayer[] => {
    const seen = new Set(ex); const out: PoolPlayer[] = [];
    while (out.length < need) { const c = pool[Math.floor(rnd() * pool.length)]; if (!seen.has(c)) { seen.add(c); out.push(c); } } return out;
  };
  const fill = (rnd: () => number, held: PoolPlayer[], hs: number, need: number): PoolPlayer[] => {
    for (let t = 0; t < 300; t++) { const pk = pick(rnd, need, held); const tot = hs + pk.reduce((s, c) => s + c.salary, 0); if (tot >= MIN && tot <= CAP) return held.concat(pk); }
    for (let t = 0; t < 300; t++) { const head = need > 1 ? pick(rnd, need - 1, held) : []; const base = hs + head.reduce((s, c) => s + c.salary, 0);
      const cand = pool.filter((c) => c.salary >= MIN - base && c.salary <= CAP - base && !held.includes(c) && !head.includes(c)); if (cand.length) return held.concat(head, [cand[Math.floor(rnd() * cand.length)]]); }
    return held.concat(pick(rnd, need, held));
  };
  const STRATS: Record<string, (l: PoolPlayer[], rnd: () => number) => PoolPlayer[]> = {
    value: (l) => l.filter((c) => c.effReal >= medReal),        // value-reading (realized-mean per $)
    valueProj: (l) => l.filter((c) => c.efficiency >= medProj), // diagnostic: projectedFp per $ (weaker proxy)
    crowd: (l) => l.filter((c) => c.ownership >= medOwn),       // draft-by-crowd (highest-owned)
    random: (l, rnd) => l.filter(() => rnd() < 0.5),
  };
  const SEEDS: Record<string, number> = { value: 11, valueProj: 22, crowd: 33, random: 44 };
  const play = (strat: (l: PoolPlayer[], rnd: () => number) => PoolPlayer[], rnd: () => number): number => {
    let l = fill(rnd, [], 0, RS); let ru = 1;
    for (;;) { const lock = ru + 1 >= MR; const held = strat(l, rnd).slice(0, RS); l = fill(rnd, held, held.reduce((s, c) => s + c.salary, 0), RS - held.length); ru++; if (lock) break; }
    return l.reduce((s, c) => s + c.logFps[Math.floor(rnd() * c.logFps.length)], 0);
  };
  const run = (name: string) => { const rnd = mulberry32(SEEDS[name]); const t: number[] = []; for (let i = 0; i < N; i++) t.push(play(STRATS[name], rnd)); return t.sort((a, b) => a - b); };
  const RES = { value: run("value"), valueProj: run("valueProj"), crowd: run("crowd"), random: run("random") };
  const starterRate = (t: number[]) => t.filter((x) => x >= 205).length / t.length;
  const pBeats = (a: number[], b: number[]) => { let acc = 0; for (const x of a) { let lo = 0, hi = b.length; while (lo < hi) { const m = (lo + hi) >> 1; if (b[m] < x) lo = m + 1; else hi = m; } let eq = lo; while (eq < b.length && b[eq] === x) eq++; acc += (lo + (eq - lo) / 2) / b.length; } return acc / a.length; };

  const valueVsCrowd = pBeats(RES.value, RES.crowd), crowdVsRandom = pBeats(RES.crowd, RES.random), valueVsRandom = pBeats(RES.value, RES.random), valueProjVsCrowd = pBeats(RES.valueProj, RES.crowd);

  it("prints the sim and asserts the pass conditions", () => {
    // eslint-disable-next-line no-console
    console.log(`\n── BASELINE SIM (2425, N=${N} seeded) ──`);
    for (const k of ["value", "valueProj", "crowd", "random"] as const)
      console.log(`  ${k.padEnd(9)} mean ${mean(RES[k]).toFixed(1)}   STARTER+ ${(starterRate(RES[k]) * 100).toFixed(1)}%`);
    console.log(`  head-to-head:  value>crowd ${(valueVsCrowd * 100).toFixed(1)}%   crowd>random ${(crowdVsRandom * 100).toFixed(1)}%   value>random ${(valueVsRandom * 100).toFixed(1)}%`);
    console.log(`  diagnostic:    valueProj>crowd ${(valueProjVsCrowd * 100).toFixed(1)}%   (projectedFp is a WEAKER value proxy than realized-mean — why 'value' uses realized-mean)`);
    console.log(`  PASS iff: crowd≈random (crowd>random in [46,54]%)  AND  value>crowd (>52%)\n`);
    // crowd-following carries NO edge over random (hard fail if it wins)
    expect(crowdVsRandom, "crowd must NOT beat random (would mean crowd collapsed into value)").toBeLessThan(0.54);
    expect(crowdVsRandom, "crowd must NOT lose to random either — it should be ~coin-flip").toBeGreaterThan(0.46);
    // the skill still works against the room
    expect(valueVsCrowd, "value-reading must beat draft-by-crowd").toBeGreaterThan(0.52);
  });
});

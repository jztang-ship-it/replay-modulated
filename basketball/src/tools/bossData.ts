/**
 * bossData.ts — shared boss substrate (ONE selection + FP path).
 *
 * Both the Step-1 table (bossTable.ts) and the Step-2 generator core
 * (bossGenerator.ts) import this so starter selection and the FP computation
 * never fork. FP is the SACRED path: computeBasketballFp + computeBasketballBadges
 * with _position injected — the exact functions computeRosterCeiling / the player
 * lineup use.
 *
 * Per team-season it returns the 5 Method-A starters (top-5 by avg minutes/game,
 * games-played floor ~30% of season length, candidates scoped via players.json
 * team + teams[]), each carrying its full per-game canonical-FP roll pool
 * (min≥10 qualifying games — the same filter as the band dump + ceiling), plus the
 * team floor (Σ min game), ceiling (Σ max game = computeRosterCeiling), and
 * expected (Σ mean game).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { computeBasketballFp } from "../adapters/fantasyPoints";
import { computeBasketballBadges } from "../adapters/badges";
import { BasketballSportConfig } from "../adapters/basketballConfig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");
const SEASONS_DIR = path.resolve(REPO, "basketball/public/data/seasons");

const WEIGHTS = BasketballSportConfig.projectionWeights;
const BADGES = (BasketballSportConfig as any).badges ?? [];
export const MIN_MINUTES = (BasketballSportConfig as any).historicalLogFilters?.minMinutes ?? 10;

export const THIN_SEASONS: Record<string, string> = {
  "9899": "lockout (50g)",
  "1112": "lockout (66g)",
  "1920": "bubble/suspended",
  "2021": "compressed (72g)",
};

export type BossStarter = {
  name: string; pos: string;
  gamePool: number[];   // per-game canonical FP (min≥10 qualifying games) — the roll pool
  gp: number; avgMin: number; meanFp: number; traded: boolean;
};
export type TeamSeason = {
  season: string; team: string;
  starters: BossStarter[];
  expected: number;     // Σ starter mean game FP (rounded 1dp — display)
  expectedRaw: number;  // Σ starter mean game FP (unrounded — use for precise routing)
  floor: number;        // Σ starter min game FP (weakest possible roll)
  ceiling: number;      // Σ starter max game FP (= computeRosterCeiling; physical cap)
  rollDepth: number;    // min games-played among starters (roll-variety binding constraint)
  startersComplete: boolean;
  tradedStarter: boolean;
  thin: string | null;
  gpFloor: number;
};

// ── Canonical per-game FP — mirrors computeRosterCeiling. ONE path. ────────────
export function canonicalFp(stats: Record<string, any>, position: string): number {
  const s = { ...stats, _position: position };
  const base = computeBasketballFp(s, WEIGHTS);
  const badgeBonus = computeBasketballBadges(s, BADGES).reduce((a: number, b: any) => a + (b.fp ?? 0), 0);
  return base + badgeBonus;
}

export function minutesOf(stats: Record<string, any>): number {
  const mp = stats.mp ?? stats.minutes ?? stats.min ?? stats.MIN ?? stats.minutesPlayed;
  if (mp === undefined || mp === null) return NaN;
  const str = String(mp);
  return str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
}

// Qualifying (played) game: positive stats AND ≥ MIN_MINUTES — the computeRosterCeiling filter.
export function qualifies(stats: Record<string, any>): boolean {
  const hasPositive = Object.values(stats).some(v => typeof v === "number" && v > 0);
  if (!hasPositive) return false;
  const mins = minutesOf(stats);
  if (Number.isFinite(mins) && mins < MIN_MINUTES) return false;
  return true;
}

export function listSeasons(): string[] {
  return fs.readdirSync(SEASONS_DIR).filter(s => /^\d{4}$/.test(s)).sort();
}

export function buildSeason(season: string): TeamSeason[] {
  const dir = path.join(SEASONS_DIR, season);
  const players: any[] = JSON.parse(fs.readFileSync(path.join(dir, "players.json"), "utf8"));
  const logs: any[] = JSON.parse(fs.readFileSync(path.join(dir, "gamelogs.json"), "utf8"));

  // Per-player qualifying games (full-season pool, basePlayerId keyed) + raw count.
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

  const scheduled = Math.max(0, ...[...rawCount.values()]);
  const gpFloor = Math.round(0.30 * scheduled);

  // Per-player stat + per-game FP pool over qualifying games.
  const stat = new Map<string, { meanFp: number; gp: number; avgMin: number; pool: number[] }>();
  for (const p of players) {
    const id = String(p.basePlayerId ?? "").trim();
    const games = gamesByPlayer.get(id) ?? [];
    if (!games.length) continue;
    const pos = String(p.position ?? "").toUpperCase();
    const pool = games.map(s => canonicalFp(s, pos));
    const mins = games.map(minutesOf).filter(Number.isFinite) as number[];
    stat.set(id, {
      meanFp: pool.reduce((a, b) => a + b, 0) / pool.length,
      gp: games.length,
      avgMin: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0,
      pool,
    });
  }

  // Team set: primary team + teams[] (traded players candidate for each stint).
  const playerById = new Map<string, any>();
  const teamCandidates = new Map<string, Set<string>>();
  for (const p of players) {
    const id = String(p.basePlayerId ?? "").trim();
    if (!id) continue;
    if (!playerById.has(id)) playerById.set(id, p);
    const teams = new Set<string>([String(p.team ?? "").trim(), ...((p.teams ?? []).map((t: any) => String(t).trim()))]);
    for (const t of teams) { if (t) (teamCandidates.get(t) ?? teamCandidates.set(t, new Set()).get(t)!).add(id); }
  }

  const out: TeamSeason[] = [];
  for (const [team, candIds] of teamCandidates) {
    // Method A: top-5 by avg minutes/game, above the games-played floor; tiebreak more games.
    const ranked = [...candIds]
      .filter(id => { const s = stat.get(id); return s && s.gp >= gpFloor; })
      .sort((a, b) => { const sa = stat.get(a)!, sb = stat.get(b)!; return sb.avgMin - sa.avgMin || sb.gp - sa.gp; })
      .slice(0, 5);
    if (!ranked.length) continue;

    const starters: BossStarter[] = ranked.map(id => {
      const p = playerById.get(id); const st = stat.get(id)!;
      return {
        name: String(p.name ?? ""), pos: String(p.position ?? "").toUpperCase(),
        gamePool: st.pool, gp: st.gp, avgMin: st.avgMin, meanFp: st.meanFp,
        traded: Array.isArray(p.teams) && p.teams.length > 1,
      };
    });

    const expectedRaw = starters.reduce((a, s) => a + s.meanFp, 0);
    out.push({
      season, team, starters,
      expected: Math.round(expectedRaw * 10) / 10, expectedRaw,
      floor: Math.round(starters.reduce((a, s) => a + Math.min(...s.gamePool), 0) * 10) / 10,
      ceiling: Math.round(starters.reduce((a, s) => a + Math.max(...s.gamePool), 0) * 10) / 10,
      rollDepth: Math.min(...starters.map(s => s.gp)),
      startersComplete: starters.length === 5,
      tradedStarter: starters.some(s => s.traded),
      thin: THIN_SEASONS[season] ?? null,
      gpFloor,
    });
  }
  return out;
}

export function buildAll(): TeamSeason[] {
  return listSeasons().flatMap(buildSeason);
}

// ── Band (P60–P85 of the strong-capped player-lineup allFps dump) ──────────────
export function pctile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
}
export function loadBand(p_lo = 60, p_hi = 85): { lo: number; hi: number; allFps: number[] } {
  const f = path.resolve(REPO, "boss_gen/player_band_allfps.json");
  if (!fs.existsSync(f)) throw new Error(`band file missing: ${f} — produce via DUMP_ALLFPS=${f} npx tsx shared/tools/runSimulator.ts basketball 10000`);
  const dump = JSON.parse(fs.readFileSync(f, "utf8"));
  const allFps: number[] = (dump.allFps as number[]).slice().sort((a, b) => a - b);
  return { lo: pctile(allFps, p_lo), hi: pctile(allFps, p_hi), allFps };
}

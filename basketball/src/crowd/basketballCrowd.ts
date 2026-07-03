/**
 * basketball/src/crowd/basketballCrowd.ts — basketball CROWD extractor.
 *
 * Turns roster data into behavioral-bias CrowdSignals, then into ownership
 * probabilities, WITHOUT touching value. Read the hard rule in
 * shared/crowd/crowdModel.ts before editing.
 *
 * VALUE-FORBIDDEN (never referenced here): salary, projectedFp, avgFP, tier,
 * points-per-dollar, and — importantly — playerCulture.salaryTier /
 * overperform / underperform / onPace / salaryNarrative / bigGame / quietGame
 * (all value/performance-RELATIVE). We use only recognition-flavored culture
 * fields. The `CrowdPlayer` input type deliberately has NO salary/projection
 * field, so value can't leak in even by accident.
 */

import {
  crowdOwnershipMap,
  type CrowdSignals,
  type CrowdWeights,
} from "@shared/crowd/crowdModel";
import { PLAYER_CULTURE } from "../utils/playerCulture";

/** Narrow, value-free view of a roster player. Intentionally excludes salary /
 *  projectedFp / avgFP / tier so the crowd model cannot see value. */
export interface CrowdPlayer {
  basePlayerId: string;
  name?: string;
  team?: string;
  position?: string;
}

/** One game log, stats only (raw box score — NOT a projection/average). */
export interface CrowdLog { stats?: Record<string, number | undefined> }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

// ── MARKET / TV visibility — big-market, nationally-televised teams get
//    over-backed regardless of the player. Behavioral prior, NOT value: note
//    OKC/MEM sit low despite being strong teams — that's the point (their studs
//    get faded → contrarian-right targets). Unknown/legacy codes → 0.30.
const TEAM_MARKET: Record<string, number> = {
  LAL: 1.00, GSW: 0.95, NYK: 0.90, BOS: 0.85, LAC: 0.75, BKN: 0.70, CHI: 0.70,
  MIA: 0.70, DAL: 0.65, PHI: 0.60,
  DEN: 0.50, MIL: 0.50, PHX: 0.50, ATL: 0.45, TOR: 0.45, CLE: 0.40, HOU: 0.40,
  SAC: 0.35, WAS: 0.35, POR: 0.35,
  OKC: 0.25, MEM: 0.25, MIN: 0.25, IND: 0.20, NOP: 0.20, UTA: 0.20, SAS: 0.20,
  ORL: 0.20, CHA: 0.15, DET: 0.15,
};
const DEFAULT_MARKET = 0.30;

// ── POSITION feel — the room leans toward scorers/wings. Mild behavioral prior;
//    NOT tied to value. Unknown → 0.50.
const POSITION_BIAS: Record<string, number> = { PG: 0.60, SG: 0.65, SF: 0.70, PF: 0.45, C: 0.55 };
const DEFAULT_POSITION = 0.50;

/** FAME — cultural salience from recognition-flavored PLAYER_CULTURE fields
 *  only. Uses nickname/knownFor/marquee + signatureGames COUNT (never the .fp)
 *  + "talked-about" buzz (rivalry/milestones/controversy). Players absent from
 *  the culture DB read as obscure. */
function fameFromCulture(baseId: string): number {
  const c = PLAYER_CULTURE[baseId];
  if (!c) return 0.05;
  let f = 0.30; // curated into the DB at all = recognizable
  f += Math.min(c.nicknames?.length ?? 0, 3) * 0.12;
  if (c.knownFor && c.knownFor.trim().length > 0) f += 0.08;
  f += Math.min(c.signatureGames?.length ?? 0, 4) * 0.07; // COUNT only — never signatureGames.fp
  if (c.alwaysFireSecondary) f += 0.25; // marquee / GOAT-tier (e.g. Jordan)
  const buzz = (c.rivalry?.length ?? 0) + (c.milestones?.length ?? 0) + (c.controversy?.length ?? 0);
  f += Math.min(buzz, 6) * 0.03;
  return clamp01(f);
}

/** RECENCY / "hot name" — rate of memorable HIGHLIGHT lines (40+ pts, or a
 *  triple-double, or a 5x5). Raw box-score salience the room remembers — NOT an
 *  average/projection. The most value-adjacent proxy, so it's lightly weighted
 *  in the engine. */
function recencyFromLogs(logs: CrowdLog[] | undefined): number {
  if (!logs || !logs.length) return 0;
  let salient = 0;
  for (const l of logs) {
    const s = l.stats ?? {};
    const pts = num(s.pts), reb = num(s.reb), ast = num(s.ast), stl = num(s.stl), blk = num(s.blk);
    const dubs = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
    const fiveByFive = pts >= 5 && reb >= 5 && ast >= 5 && stl >= 5 && blk >= 5;
    if (pts >= 40 || dubs >= 3 || fiveByFive) salient++;
  }
  return clamp01(salient / 4);
}

/** Behavioral signals per player (id → CrowdSignals), value-free. */
export function buildBasketballCrowdSignals(
  players: CrowdPlayer[],
  logsByBaseId: Map<string, CrowdLog[]>,
): Map<string, CrowdSignals> {
  const out = new Map<string, CrowdSignals>();
  for (const p of players) {
    const id = String(p.basePlayerId);
    out.set(id, {
      fame: fameFromCulture(id),
      recency: recencyFromLogs(logsByBaseId.get(id)),
      market: TEAM_MARKET[String(p.team ?? "").toUpperCase()] ?? DEFAULT_MARKET,
      position: POSITION_BIAS[String(p.position ?? "").toUpperCase()] ?? DEFAULT_POSITION,
    });
  }
  return out;
}

/** Roster ownership probability [0,1] per player — "% of the room that backs
 *  him." The phase-1 deliverable. */
export function basketballCrowdOwnership(
  players: CrowdPlayer[],
  logsByBaseId: Map<string, CrowdLog[]>,
  weights?: CrowdWeights,
): Map<string, number> {
  return crowdOwnershipMap(buildBasketballCrowdSignals(players, logsByBaseId), weights);
}

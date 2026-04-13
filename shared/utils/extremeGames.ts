/**
 * shared/utils/extremeGames.ts
 *
 * Two-tier extreme game detection for commentary:
 *
 * TIER 1 — MUST MENTION (leads commentary, the stat line IS the story):
 *   god_mode_pts (50+), five_by_five, wizard_ast (15+), monster_reb (18+),
 *   lockdown_stl (5+), rim_protector (5+), turnover_disaster (8+), ghost_game
 *
 * TIER 2 — SUPPLEMENTARY (adds color to normal commentary, doesn't lead):
 *   triple_double, elite_pts (40-49), elite_reb (15-17), elite_ast (12-14)
 *
 * Tier 1 overrides the normal commentary flow.
 * Tier 2 enriches it — "solid night from Tatum... and he notched the triple-double."
 */

export interface ExtremeFlag {
  type: ExtremeType;
  /** 1 = must-mention (leads commentary), 2 = supplementary (enriches) */
  tier: 1 | 2;
  /** Priority within tier (higher = more noteworthy) */
  priority: number;
  headline: string;
  keyStat: string;
  value: number;
}

export type ExtremeType =
  | "god_mode_pts"     // T1: 50+ pts
  | "five_by_five"     // T1: all 5 cats ≥ 5
  | "wizard_ast"       // T1: 15+ ast
  | "monster_reb"      // T1: 18+ reb
  | "lockdown_stl"     // T1: 5+ stl
  | "rim_protector"    // T1: 5+ blk
  | "turnover_disaster"// T1: 8+ to
  | "ghost_game"       // T1: 0 pts from $30+ card
  | "triple_double"    // T2: 3 cats ≥ 10
  | "elite_pts"        // T2: 40-49 pts
  | "elite_reb"        // T2: 15-17 reb
  | "elite_ast";       // T2: 12-14 ast

export function detectExtremes(stats: Record<string, any>, salary?: number): ExtremeFlag[] {
  const flags: ExtremeFlag[] = [];
  const pts = Number(stats.pts ?? 0);
  const reb = Number(stats.reb ?? 0);
  const ast = Number(stats.ast ?? 0);
  const stl = Number(stats.stl ?? 0);
  const blk = Number(stats.blk ?? 0);
  const to = Number(stats.turnovers ?? stats.to ?? 0);

  // ── TIER 1 — must-mention, leads commentary ──

  if (pts >= 50) {
    flags.push({ type: "god_mode_pts", tier: 1, priority: 100, headline: `${pts} points — God Mode`, keyStat: "pts", value: pts });
  }
  if ([pts, reb, ast, stl, blk].every(v => v >= 5)) {
    flags.push({ type: "five_by_five", tier: 1, priority: 98, headline: "5x5 — one of the rarest stat lines in basketball", keyStat: "5x5", value: 1 });
  }
  if (ast >= 15) {
    flags.push({ type: "wizard_ast", tier: 1, priority: 90, headline: `${ast} assists — the floor was his`, keyStat: "ast", value: ast });
  }
  if (reb >= 18) {
    flags.push({ type: "monster_reb", tier: 1, priority: 85, headline: `${reb} rebounds — owned the glass`, keyStat: "reb", value: reb });
  }
  if (stl >= 5) {
    flags.push({ type: "lockdown_stl", tier: 1, priority: 75, headline: `${stl} steals — pickpocket mode`, keyStat: "stl", value: stl });
  }
  if (blk >= 5) {
    flags.push({ type: "rim_protector", tier: 1, priority: 75, headline: `${blk} blocks — the paint was closed`, keyStat: "blk", value: blk });
  }
  if (to >= 8) {
    flags.push({ type: "turnover_disaster", tier: 1, priority: 65, headline: `${to} turnovers — gave the ball away all night`, keyStat: "to", value: to });
  }
  if (pts === 0 && salary != null && salary >= 30) {
    flags.push({ type: "ghost_game", tier: 1, priority: 60, headline: "Zero points from a high-salary card — ghost game", keyStat: "pts", value: 0 });
  }

  // ── TIER 2 — supplementary, adds color but doesn't lead ──

  const cats10 = [pts, reb, ast, stl, blk].filter(v => v >= 10).length;
  if (cats10 >= 3) {
    flags.push({ type: "triple_double", tier: cats10 >= 4 ? 1 : 2, priority: cats10 >= 4 ? 99 : 40, headline: cats10 >= 4 ? "Quad-double — historically rare" : "triple-double", keyStat: "triple_dbl", value: cats10 });
  }
  if (pts >= 40 && pts < 50) {
    flags.push({ type: "elite_pts", tier: 2, priority: 35, headline: `${pts}-point night`, keyStat: "pts", value: pts });
  }
  if (reb >= 15 && reb < 18) {
    flags.push({ type: "elite_reb", tier: 2, priority: 30, headline: `${reb} boards`, keyStat: "reb", value: reb });
  }
  if (ast >= 12 && ast < 15) {
    flags.push({ type: "elite_ast", tier: 2, priority: 25, headline: `${ast} dimes`, keyStat: "ast", value: ast });
  }

  // Sort: tier 1 first, then by priority descending
  flags.sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : b.priority - a.priority);
  return flags;
}

/** Get only tier 1 (must-mention) flags. */
export function getTier1Extremes(flags: ExtremeFlag[]): ExtremeFlag[] {
  return flags.filter(f => f.tier === 1);
}

/** Get only tier 2 (supplementary) flags. */
export function getTier2Extremes(flags: ExtremeFlag[]): ExtremeFlag[] {
  return flags.filter(f => f.tier === 2);
}

/**
 * Build commentary text for extreme games.
 * Tier 1: leads the commentary — "X went absolutely off — [headlines]."
 * Tier 2: supplements — "...and notched the triple-double."
 */
export function describeExtremes(flags: ExtremeFlag[], playerName: string): string {
  const t1 = getTier1Extremes(flags);
  const t2 = getTier2Extremes(flags);

  if (t1.length === 0 && t2.length === 0) return "";

  let result = "";

  // Tier 1 leads
  if (t1.length >= 2) {
    const parts = t1.slice(0, 3).map(f => f.headline);
    result = `${playerName} went absolutely off — ${parts.join(", ")}. This is a historic stat line.`;
  } else if (t1.length === 1) {
    result = `${playerName}: ${t1[0].headline}. Flip the card — this stat line tells the whole story.`;
  }

  // Tier 2 supplements (only if no tier 1, or appended briefly)
  if (t1.length === 0 && t2.length > 0) {
    // No tier 1 — tier 2 enriches the normal performance narrative
    const supplement = t2.map(f => f.headline).join(", ");
    result = `${playerName} also had the ${supplement}.`;
  } else if (t1.length > 0 && t2.length > 0) {
    // Append tier 2 as supplementary
    result += ` Also a ${t2[0].headline}.`;
  }

  return result;
}

export function isExtremeGame(stats: Record<string, any>, salary?: number): boolean {
  return detectExtremes(stats, salary).length > 0;
}

export function hasTier1Extreme(stats: Record<string, any>, salary?: number): boolean {
  return detectExtremes(stats, salary).some(f => f.tier === 1);
}

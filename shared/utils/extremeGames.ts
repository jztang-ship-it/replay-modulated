/**
 * shared/utils/extremeGames.ts
 *
 * Detects and categorizes extreme/outlier game logs that deserve
 * special commentary attention. Both positive and negative extremes.
 *
 * When an extreme game is drawn, commentary should center on what
 * makes it special — the stat line is the story.
 *
 * DATA RANGES (from 60,000+ game logs):
 *   50+ pts: 38 games (Luka 73, Embiid 70, Giannis 64...)
 *   45+ pts: 88 games
 *   18+ reb: 203 games (Nurkic 31, Sabonis 28...)
 *   15+ ast: 115 games (Haliburton 23, Trae 22, Jokic 22...)
 *   5+ stl:  216 games
 *   5+ blk:  212 games
 *   Triple doubles: 285 games
 *   5x5: 2 games (both Wembanyama)
 *   8+ turnovers: 76 games (Sabonis 11, Trae 11, LeBron 11...)
 */

export interface ExtremeFlag {
  /** Short ID for the extreme type */
  type: ExtremeType;
  /** Priority (higher = more noteworthy, should be mentioned first) */
  priority: number;
  /** Human-readable headline for commentary */
  headline: string;
  /** Key stat that makes this extreme */
  keyStat: string;
  /** Value of the key stat */
  value: number;
}

export type ExtremeType =
  | "god_mode_pts"     // 50+ pts
  | "elite_pts"        // 40-49 pts
  | "monster_reb"      // 18+ reb
  | "elite_reb"        // 15-17 reb
  | "wizard_ast"       // 15+ ast
  | "elite_ast"        // 12-14 ast
  | "lockdown_stl"     // 5+ stl
  | "rim_protector"    // 5+ blk
  | "five_by_five"     // all 5 cats ≥ 5
  | "triple_double"    // 3 cats ≥ 10
  | "turnover_disaster"// 8+ to
  | "ghost_game";      // 0 pts from a starter/star ($30+ salary)

export function detectExtremes(stats: Record<string, any>, salary?: number): ExtremeFlag[] {
  const flags: ExtremeFlag[] = [];
  const pts = Number(stats.pts ?? 0);
  const reb = Number(stats.reb ?? 0);
  const ast = Number(stats.ast ?? 0);
  const stl = Number(stats.stl ?? 0);
  const blk = Number(stats.blk ?? 0);
  const to = Number(stats.turnovers ?? stats.to ?? 0);

  // Scoring extremes
  if (pts >= 50) {
    flags.push({ type: "god_mode_pts", priority: 100, headline: `${pts} points — God Mode`, keyStat: "pts", value: pts });
  } else if (pts >= 40) {
    flags.push({ type: "elite_pts", priority: 70, headline: `${pts}-point explosion`, keyStat: "pts", value: pts });
  }

  // Rebounding extremes
  if (reb >= 18) {
    flags.push({ type: "monster_reb", priority: 85, headline: `${reb} rebounds — owned the glass`, keyStat: "reb", value: reb });
  } else if (reb >= 15) {
    flags.push({ type: "elite_reb", priority: 60, headline: `${reb} boards`, keyStat: "reb", value: reb });
  }

  // Assist extremes
  if (ast >= 15) {
    flags.push({ type: "wizard_ast", priority: 90, headline: `${ast} assists — the floor was his`, keyStat: "ast", value: ast });
  } else if (ast >= 12) {
    flags.push({ type: "elite_ast", priority: 55, headline: `${ast} dimes`, keyStat: "ast", value: ast });
  }

  // Defensive extremes
  if (stl >= 5) {
    flags.push({ type: "lockdown_stl", priority: 75, headline: `${stl} steals — pickpocket artist`, keyStat: "stl", value: stl });
  }
  if (blk >= 5) {
    flags.push({ type: "rim_protector", priority: 75, headline: `${blk} blocks — paint was closed`, keyStat: "blk", value: blk });
  }

  // Multi-stat extremes (highest priority — rarest)
  const cats10 = [pts, reb, ast, stl, blk].filter(v => v >= 10).length;
  const cats5 = [pts, reb, ast, stl, blk].every(v => v >= 5);
  if (cats5) {
    flags.push({ type: "five_by_five", priority: 98, headline: `5x5 — only 2 players in our data have done this`, keyStat: "5x5", value: 1 });
  }
  if (cats10 >= 3) {
    flags.push({ type: "triple_double", priority: cats10 >= 4 ? 99 : 80, headline: cats10 >= 4 ? "Quad-double — historically rare" : "Triple-double", keyStat: "triple_dbl", value: cats10 });
  }

  // Negative extremes
  if (to >= 8) {
    flags.push({ type: "turnover_disaster", priority: 65, headline: `${to} turnovers — gave the ball away all night`, keyStat: "to", value: to });
  }
  if (pts === 0 && salary != null && salary >= 30) {
    flags.push({ type: "ghost_game", priority: 60, headline: "Zero points from a high-salary card", keyStat: "pts", value: 0 });
  }

  // Sort by priority descending
  flags.sort((a, b) => b.priority - a.priority);
  return flags;
}

/** Build a commentary-ready description of the most notable extreme(s). */
export function describeExtremes(flags: ExtremeFlag[], playerName: string): string {
  if (flags.length === 0) return "";
  const top = flags[0];

  // For multi-stat games, combine the headlines
  if (flags.length >= 3) {
    const stats = flags.slice(0, 3).map(f => f.keyStat === "triple_dbl" || f.keyStat === "5x5" ? f.headline : `${f.value} ${f.keyStat}`);
    return `${playerName} went absolutely off — ${stats.join(", ")}. This stat line is historic.`;
  }
  if (flags.length === 2) {
    return `${playerName}: ${flags[0].headline} and ${flags[1].headline}. That's a special game.`;
  }
  return `${playerName}: ${top.headline}.`;
}

/** Check if a card's game qualifies as extreme (any flag). */
export function isExtremeGame(stats: Record<string, any>, salary?: number): boolean {
  return detectExtremes(stats, salary).length > 0;
}

/** Get the highest priority extreme type, or null. */
export function getTopExtreme(stats: Record<string, any>, salary?: number): ExtremeType | null {
  const flags = detectExtremes(stats, salary);
  return flags.length > 0 ? flags[0].type : null;
}

import type { AchievementDef, AchievementContext } from "@shared/achievements";
import { registerAchievements } from "@shared/achievements";

// Season format: 4-char compact string — "2425" = 2024-25, "9900" = 1999-2000.
// Cutoff of 50 keeps us correct through 2049 (yy<50 → 2000s+, yy>=50 → 1900s).
function parseStartYear(season: string): number {
  if (!season || season.length < 2) return 0;
  const yy = parseInt(season.slice(0, 2), 10);
  if (isNaN(yy)) return 0;
  return yy < 50 ? 2000 + yy : 1900 + yy;
}

function maxFp(ctx: AchievementContext): number {
  return Math.max(...ctx.cards.map(c => c.fp), 0);
}

function minFp(ctx: AchievementContext): number {
  if (ctx.cards.length === 0) return 0;
  return Math.min(...ctx.cards.map(c => c.fp));
}

function allAbove(ctx: AchievementContext, threshold: number): boolean {
  return ctx.cards.length >= 5 && ctx.cards.every(c => c.fp >= threshold);
}

function countAbove(ctx: AchievementContext, threshold: number): number {
  return ctx.cards.filter(c => c.fp >= threshold).length;
}

function maxFpByPositions(ctx: AchievementContext, positions: string[]): number {
  const posSet = new Set(positions.map(p => p.toUpperCase()));
  const matching = ctx.cards.filter(c => posSet.has(c.position.toUpperCase()));
  return Math.max(...matching.map(c => c.fp), 0);
}

export const BASKETBALL_ACHIEVEMENTS: AchievementDef[] = [
  // ── Bronze: single-hand performance moments ────────────────────────────────

  {
    id: "bball_first_win",
    tier: "bronze",
    sport: "basketball",
    title: "First W",
    description: "Win your first hand.",
    predicate: (ctx) => ctx.isWin,
  },
  {
    id: "bball_all_star_debut",
    tier: "bronze",
    sport: "basketball",
    title: "All-Star Debut",
    description: "Reach ALL_STAR tier for the first time.",
    predicate: (ctx) => ["ALL_STAR", "MVP", "LEGEND"].includes(ctx.fpTier),
  },
  {
    id: "bball_mvp_class",
    tier: "bronze",
    sport: "basketball",
    title: "MVP Class",
    description: "Reach MVP tier for the first time.",
    predicate: (ctx) => ["MVP", "LEGEND"].includes(ctx.fpTier),
  },
  {
    id: "bball_legend_status",
    tier: "bronze",
    sport: "basketball",
    title: "Legend Status",
    description: "Reach LEGEND — the highest rating.",
    predicate: (ctx) => ctx.fpTier === "LEGEND",
  },
  {
    id: "bball_century_club",
    tier: "bronze",
    sport: "basketball",
    title: "Century Club",
    description: "Score 100+ total FP in a single hand.",
    predicate: (ctx) => ctx.totalFp >= 100,
  },
  {
    id: "bball_double_century",
    tier: "bronze",
    sport: "basketball",
    title: "Double Century",
    description: "Score 200+ total FP in a single hand.",
    predicate: (ctx) => ctx.totalFp >= 200,
  },
  {
    id: "bball_carry_king",
    tier: "bronze",
    sport: "basketball",
    title: "Carry King",
    description: "One player scores 50+ FP.",
    predicate: (ctx) => maxFp(ctx) >= 50,
  },
  {
    id: "bball_transcendent",
    tier: "bronze",
    sport: "basketball",
    title: "Transcendent",
    description: "One player scores 70+ FP.",
    predicate: (ctx) => maxFp(ctx) >= 70,
  },
  {
    id: "bball_all_stars_five",
    tier: "bronze",
    sport: "basketball",
    title: "All-Stars Five",
    description: "Every player in your lineup scores 20+ FP.",
    predicate: (ctx) => allAbove(ctx, 20),
  },
  {
    id: "bball_starting_five",
    tier: "bronze",
    sport: "basketball",
    title: "Starting Five",
    description: "Every player scores 30+ FP.",
    predicate: (ctx) => allAbove(ctx, 30),
  },
  {
    id: "bball_dynasty_lineup",
    tier: "bronze",
    sport: "basketball",
    title: "Dynasty Lineup",
    description: "Every player scores 40+ FP.",
    predicate: (ctx) => allAbove(ctx, 40),
  },
  {
    id: "bball_big_three",
    tier: "bronze",
    sport: "basketball",
    title: "Big Three",
    description: "At least 3 players each score 35+ FP.",
    predicate: (ctx) => countAbove(ctx, 35) >= 3,
  },
  {
    id: "bball_balanced_attack",
    tier: "bronze",
    sport: "basketball",
    title: "Balanced Attack",
    description: "All players within 12 FP of each other.",
    predicate: (ctx) => ctx.cards.length >= 5 && (maxFp(ctx) - minFp(ctx)) <= 12,
  },
  {
    id: "bball_high_roller",
    tier: "bronze",
    sport: "basketball",
    title: "High Roller",
    description: "Win a hand with 200+ total FP.",
    predicate: (ctx) => ctx.isWin && ctx.totalFp >= 200,
  },

  // ── Silver: grinder milestones ────────────────────────────────────────────

  {
    id: "bball_played_10",
    tier: "silver",
    sport: "basketball",
    title: "Just Getting Started",
    description: "Play 10 hands.",
    predicate: (ctx) => ctx.handsPlayed >= 10,
  },
  {
    id: "bball_played_25",
    tier: "silver",
    sport: "basketball",
    title: "Building a Habit",
    description: "Play 25 hands.",
    predicate: (ctx) => ctx.handsPlayed >= 25,
  },
  {
    id: "bball_played_50",
    tier: "silver",
    sport: "basketball",
    title: "Committed",
    description: "Play 50 hands.",
    predicate: (ctx) => ctx.handsPlayed >= 50,
  },
  {
    id: "bball_played_100",
    tier: "silver",
    sport: "basketball",
    title: "True Believer",
    description: "Play 100 hands.",
    predicate: (ctx) => ctx.handsPlayed >= 100,
  },
  {
    id: "bball_played_250",
    tier: "silver",
    sport: "basketball",
    title: "Die Hard",
    description: "Play 250 hands.",
    predicate: (ctx) => ctx.handsPlayed >= 250,
  },
  {
    id: "bball_played_500",
    tier: "silver",
    sport: "basketball",
    title: "Hall of Fame Scout",
    description: "Play 500 hands.",
    predicate: (ctx) => ctx.handsPlayed >= 500,
  },
  {
    id: "bball_hot_streak_3",
    tier: "silver",
    sport: "basketball",
    title: "On Fire",
    description: "Win 3 hands in a row.",
    predicate: (ctx) => ctx.streak >= 3,
  },
  {
    id: "bball_hot_streak_5",
    tier: "silver",
    sport: "basketball",
    title: "Can't Miss",
    description: "Win 5 hands in a row.",
    predicate: (ctx) => ctx.streak >= 5,
  },
  {
    id: "bball_hot_streak_10",
    tier: "silver",
    sport: "basketball",
    title: "Unstoppable",
    description: "Win 10 hands in a row.",
    predicate: (ctx) => ctx.streak >= 10,
  },
  {
    id: "bball_hot_streak_20",
    tier: "silver",
    sport: "basketball",
    title: "Legendary Run",
    description: "Win 20 hands in a row.",
    predicate: (ctx) => ctx.streak >= 20,
  },

  // ── Gold: cross-era exploration + positional showcase ─────────────────────

  {
    id: "bball_point_god",
    tier: "gold",
    sport: "basketball",
    title: "Point God",
    description: "A point guard scores 50+ FP.",
    predicate: (ctx) => maxFpByPositions(ctx, ["PG"]) >= 50,
  },
  {
    id: "bball_big_man_era",
    tier: "gold",
    sport: "basketball",
    title: "Big Man Era",
    description: "A center or power forward scores 60+ FP.",
    predicate: (ctx) => maxFpByPositions(ctx, ["C", "PF"]) >= 60,
  },
  {
    id: "bball_wing_takeover",
    tier: "gold",
    sport: "basketball",
    title: "Wing Takeover",
    description: "A small forward or shooting guard scores 55+ FP.",
    predicate: (ctx) => maxFpByPositions(ctx, ["SF", "SG"]) >= 55,
  },
  {
    id: "bball_squad_goals",
    tier: "gold",
    sport: "basketball",
    title: "Squad Goals",
    description: "All 5 players are from the same team.",
    predicate: (ctx) => {
      if (ctx.cards.length < 5) return false;
      const team = ctx.cards[0].team;
      return team !== "" && ctx.cards.every(c => c.team === team);
    },
  },
  {
    id: "bball_legend_card",
    tier: "gold",
    sport: "basketball",
    title: "Legend on Your Team",
    description: "A RED-tier card appears in your lineup.",
    predicate: (ctx) => ctx.cards.some(c => c.tier === "RED"),
  },
  {
    id: "bball_old_school",
    tier: "gold",
    sport: "basketball",
    title: "Old School",
    description: "Play a hand from before 1980 (pre-Magic/Bird era).",
    predicate: (ctx) => parseStartYear(ctx.season) > 0 && parseStartYear(ctx.season) < 1980,
  },
  {
    id: "bball_showtime",
    tier: "gold",
    sport: "basketball",
    title: "Showtime",
    description: "Play a hand from the 1980s (Magic, Bird, Jordan debut).",
    predicate: (ctx) => {
      const y = parseStartYear(ctx.season);
      return y >= 1980 && y < 1990;
    },
  },
  {
    id: "bball_jordan_era",
    tier: "gold",
    sport: "basketball",
    title: "Be Like Mike",
    description: "Play a hand from the 1990s (Jordan's championship era).",
    predicate: (ctx) => {
      const y = parseStartYear(ctx.season);
      return y >= 1990 && y < 2000;
    },
  },
  {
    id: "bball_kobe_era",
    tier: "gold",
    sport: "basketball",
    title: "Mamba Mentality",
    description: "Play a hand from the 2000s (Kobe, AI, Shaq era).",
    predicate: (ctx) => {
      const y = parseStartYear(ctx.season);
      return y >= 2000 && y < 2010;
    },
  },
  {
    id: "bball_curry_era",
    tier: "gold",
    sport: "basketball",
    title: "Splash Zone",
    description: "Play a hand from 2015 or later (three-point revolution).",
    predicate: (ctx) => parseStartYear(ctx.season) >= 2015,
  },
  {
    id: "bball_modern_game",
    tier: "gold",
    sport: "basketball",
    title: "Modern Game",
    description: "Play a hand from 2010 or later.",
    predicate: (ctx) => parseStartYear(ctx.season) >= 2010,
  },
];

// Register at module load time. Imported by basketball's SportAdapter.
registerAchievements(BASKETBALL_ACHIEVEMENTS);

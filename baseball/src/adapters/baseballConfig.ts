/**
 * baseballConfig.ts — Layer 2 (MLB-specific)
 *
 * Roster: 1 P + 4 BAT.
 * Salary cap: $180.
 *
 * FP weights (per stat unit):
 *   Hitters: H=12, 2B=5, 3B=10, HR=20, R=9, RBI=9, BB=6, SB=12
 *   Pitchers: IP=3, K=4, ER=-3, W=6, QS=8
 *
 * Tier thresholds tuned for baseball FP distribution.
 * Typical hitter hand: 40-80 FP. Typical pitcher: 20-60 FP.
 * Mixed roster: 200-350 FP range for a 6-card hand.
 */

export type BaseballSportKey = "baseball";
export type BaseballSlot = "P" | "BAT";
export type BaseballTier = "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "GOAT";

export type BaseballStatCategory =
  | "h" | "doubles" | "triples" | "hr" | "r" | "rbi" | "bb" | "sb"
  | "ip" | "k" | "er" | "w" | "qs";

export type BaseballProjectionWeights = Record<BaseballStatCategory, number>;

export interface BaseballWinThreshold {
  tier: BaseballTier;
  minFP: number;
  multiplier: number;
  progressive?: boolean;
}

export interface BaseballBadgeDef {
  id: string;
  icon: string;
  label: string;
  fp: number;
  test: (stats: Record<string, any>) => boolean;
}

export const BaseballSportConfig = {
  // ── Sport identity ──────────────────────────────────────────────────────
  sportKey: "baseball" as BaseballSportKey,
  name: "MLB Baseball",
  sportLabel: "MLB",

  // ── Roster / slots ──────────────────────────────────────────────────────
  rosterSize: 5,
  rosterSlots: ["P", "BAT", "BAT", "BAT", "BAT"] as const satisfies Readonly<BaseballSlot[]>,
  salaryCap: 180,

  // ── Positions ───────────────────────────────────────────────────────────
  positions: ["P", "BAT"] as string[],
  positionAliases: {
    SP: "P", RP: "P", LHP: "P", RHP: "P", PITCHER: "P",
    C: "BAT", "1B": "BAT", "2B": "BAT", "3B": "BAT", SS: "BAT",
    OF: "BAT", LF: "BAT", CF: "BAT", RF: "BAT", DH: "BAT",
  } as Record<string, string>,

  // ── Stat categories ─────────────────────────────────────────────────────
  hitStatCategories: ["h", "doubles", "triples", "hr", "r", "rbi", "bb", "sb"] as const,
  pitchStatCategories: ["ip", "k", "er", "w", "qs"] as const,
  statCategories: [
    "h", "doubles", "triples", "hr", "r", "rbi", "bb", "sb",
    "ip", "k", "er", "w", "qs",
  ] as const satisfies Readonly<BaseballStatCategory[]>,

  statDisplay: {
    default: [
      { key: "h",       label: "H"   },
      { key: "doubles", label: "2B"  },
      { key: "triples", label: "3B"  },
      { key: "hr",      label: "HR"  },
      { key: "r",       label: "R"   },
      { key: "rbi",     label: "RBI" },
      { key: "bb",      label: "BB"  },
      { key: "sb",      label: "SB"  },
    ],
    P: [
      { key: "ip",  label: "IP" },
      { key: "k",   label: "K"  },
      { key: "er",  label: "ER" },
      { key: "w",   label: "W"  },
      { key: "qs",  label: "QS" },
    ],
  },

  // ── FP weights ──────────────────────────────────────────────────────────
  projectionWeights: {
    h: 12, doubles: 5, triples: 10, hr: 20,
    r: 9,  rbi: 9,    bb: 6,       sb: 12,
    ip: 3, k: 4,      er: -3,      w: 6, qs: 8,
  } as BaseballProjectionWeights,

  // ── Log filters ─────────────────────────────────────────────────────────
  historicalLogFilters: {
    minMinutes: 0, // no minutes concept in baseball
    minQuickFP: 0,
  },

  // ── Badges ──────────────────────────────────────────────────────────────
  badges: {
    hitters: [
      {
        id: "GOING_YARD",
        icon: "🚀",
        label: "Going Yard",
        fp: 10,
        test: (s: Record<string, any>) => Number(s.hr ?? 0) >= 2,
      },
      {
        id: "MULTI_HIT",
        icon: "⚾",
        label: "Multi Hit",
        fp: 5,
        test: (s: Record<string, any>) => Number(s.h ?? 0) >= 3,
      },
      {
        id: "RBI_MACHINE",
        icon: "🧩",
        label: "RBI Machine",
        fp: 8,
        test: (s: Record<string, any>) => Number(s.rbi ?? 0) >= 4,
      },
      {
        id: "SPEEDSTER",
        icon: "💨",
        label: "Speedster",
        fp: 6,
        test: (s: Record<string, any>) => Number(s.sb ?? 0) >= 2,
      },
      {
        id: "PERFECT_DAY",
        icon: "🌞",
        label: "Perfect Day",
        fp: 15,
        test: (s: Record<string, any>) =>
          Number(s.h ?? 0) >= 3 && Number(s.hr ?? 0) >= 1 && Number(s.rbi ?? 0) >= 3,
      },
    ] as BaseballBadgeDef[],
    pitchers: [
      {
        id: "ACE",
        icon: "👑",
        label: "Ace",
        fp: 10,
        test: (s: Record<string, any>) => Number(s.k ?? 0) >= 10,
      },
      {
        id: "SHUTDOWN",
        icon: "🛑",
        label: "Shutdown",
        fp: 8,
        test: (s: Record<string, any>) => Number(s.ip ?? 0) >= 7 && Number(s.er ?? 0) === 0,
      },
      {
        id: "STRIKEOUT_KING",
        icon: "🔥",
        label: "Strikeout King",
        fp: 5,
        test: (s: Record<string, any>) => Number(s.k ?? 0) >= 7 && Number(s.k ?? 0) < 10,
      },
      {
        id: "MELTDOWN",
        icon: "🌪️",
        label: "Meltdown",
        fp: -5,
        test: (s: Record<string, any>) => Number(s.er ?? 0) >= 5,
      },
    ] as BaseballBadgeDef[],
  },

  // ── Win tiers ───────────────────────────────────────────────────────────
  // Tuned for 5-card baseball hand FP distribution.
  // Typical range: 150-400 FP. Median ~230 FP.
  winCondition: {
    type: "FIXED_THRESHOLD" as const,
    thresholds: [
      { tier: "ROOKIE",   minFP: 102, multiplier: 0.5 },
      { tier: "STARTER",  minFP: 128, multiplier: 2.5 },
      { tier: "ALL_STAR", minFP: 150, multiplier: 7 },
      { tier: "MVP",      minFP: 171, multiplier: 15 },
      { tier: "GOAT",     minFP: 209, multiplier: 50, progressive: true },
    ] as BaseballWinThreshold[],
  },
};

export default BaseballSportConfig;

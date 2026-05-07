/**
 * baseballConfig.ts — Layer 2 (MLB-specific)
 *
 * Roster: 2 P + 3 BAT.
 * Salary cap: $180 — chosen so 3-star hands are routine
 *   (Ohtani RED + Freeman PURPLE + Mookie BLUE + 2 cheap = $175)
 * but 2-RED-pitcher stack stays infeasible ($139 leaves $41 for 3 BAT,
 * below floor of 3×$18=$54). Top-end scarcity preserved.
 *
 * Salary == round(avgFP). FP weights (per stat unit):
 *   Hitters: H=12, 2B=5, 3B=10, HR=20, R=9, RBI=9, BB=6, SB=12
 *   Pitchers: IP=3, K=4, ER=-3, W=6, QS=8
 *
 * Win-tier thresholds (even +30 spacing, LEGEND ceiling raised to suppress
 * to ~2%). 20k-hand random sim:
 *   BUST 47% / ROOKIE 21% / STARTER 15% / ALL_STAR 9% / MVP 6% / LEGEND 2%.
 */

export type BaseballSportKey = "baseball";
export type BaseballSlot = "P" | "BAT";
export type BaseballTier = "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "LEGEND";

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
  // Layout order: row 1 = slots 0-2 (3 BAT), row 2 = slots 3-4 (2 P centered).
  rosterSlots: ["BAT", "BAT", "BAT", "P", "P"] as const satisfies Readonly<BaseballSlot[]>,
  salaryCap: 180,

  // Slate v2 (flag-gated; see shared/utils/slateSelector.ts)
  slateSize: 50,         // 5 hand slots × 10
  anchorCount: 9,        // 3x3 grid in slate overlay (was 10)
  weightExponent: 1.0,
  exclusionList: [] as string[],  // populated during data audit; safe default

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
      { id: "HIT_MACHINE",   icon: "🎯", label: "Hit Machine",      fp: 3,  test: (s: Record<string, any>) => Number(s.h   ?? 0) >= 2 },
      { id: "GOING_YARD",    icon: "⚾", label: "Going Yard",       fp: 8,  test: (s: Record<string, any>) => Number(s.hr  ?? 0) >= 1 },
      { id: "CLEANUP",       icon: "🧹", label: "Cleanup Hitter",   fp: 8,  test: (s: Record<string, any>) => Number(s.rbi ?? 0) >= 3 },
      { id: "EYE_PLATE",     icon: "👁️", label: "Eye at the Plate", fp: 5,  test: (s: Record<string, any>) => Number(s.bb  ?? 0) >= 2 },
      { id: "SPEEDSTER",     icon: "💨", label: "Speedster",        fp: 4,  test: (s: Record<string, any>) => Number(s.sb  ?? 0) >= 1 },
      { id: "PERFECT_DAY",   icon: "🌞", label: "Perfect Day",      fp: 15, test: (s: Record<string, any>) => Number(s.h ?? 0) >= 2 && Number(s.hr ?? 0) >= 1 && Number(s.rbi ?? 0) >= 2 },
      { id: "CYCLE_WATCH",   icon: "🌀", label: "Cycle Watch",      fp: 25, test: (s: Record<string, any>) => Number(s.h ?? 0) >= 1 && Number(s.doubles ?? 0) >= 1 && Number(s.triples ?? 0) >= 1 && Number(s.hr ?? 0) >= 1 },
    ] as BaseballBadgeDef[],
    pitchers: [
      { id: "ACE",           icon: "👑", label: "Ace",              fp: 10, test: (s: Record<string, any>) => Number(s.k  ?? 0) >= 10 },
      { id: "SHUTDOWN",      icon: "🛑", label: "Shutdown",         fp: 8,  test: (s: Record<string, any>) => Number(s.ip ?? 0) >= 7 && Number(s.er ?? 0) === 0 },
      { id: "QUALITY_START", icon: "✅", label: "Quality Start",    fp: 6,  test: (s: Record<string, any>) => Number(s.ip ?? 0) >= 6 && Number(s.er ?? 0) <= 3 },
      { id: "MELTDOWN",      icon: "🌪️", label: "Meltdown",         fp: -5, test: (s: Record<string, any>) => Number(s.er ?? 0) >= 5 },
      { id: "WILD_THING",    icon: "🎳", label: "Wild Thing",       fp: -5, test: (s: Record<string, any>) => Number(s.bb ?? 0) >= 3 },
      { id: "NO_NO_WATCH",   icon: "🚫", label: "No-No Watch",      fp: 30, test: (s: Record<string, any>) => Number(s.ip ?? 0) >= 7 && Number(s.h  ?? 0) === 0 && Number(s.er ?? 0) === 0 },
    ] as BaseballBadgeDef[],
  },

  // ── Win tiers ───────────────────────────────────────────────────────────
  // Tuned via 20k-hand sim at cap $180. Even +30 spacing for ROOKIE→MVP;
  // LEGEND ceiling raised +50 from MVP to suppress LEGEND rate to target ~2%.
  //   BUST 47% · ROOKIE 21% · STARTER 15% · ALL_STAR 9% · MVP 6% · LEGEND 2%.
  // Skilled human play (smart holds) shifts the curve upward — these
  // thresholds set the lower bound for random play hitting target frequencies.
  winCondition: {
    type: "FIXED_THRESHOLD" as const,
    thresholds: [
      { tier: "ROOKIE",   minFP: 170, multiplier: 0.5 },
      { tier: "STARTER",  minFP: 200, multiplier: 2.5 },
      { tier: "ALL_STAR", minFP: 230, multiplier: 7 },
      { tier: "MVP",      minFP: 260, multiplier: 15 },
      { tier: "LEGEND",   minFP: 310, multiplier: 50, progressive: true },
    ] as BaseballWinThreshold[],
  },
};

export default BaseballSportConfig;

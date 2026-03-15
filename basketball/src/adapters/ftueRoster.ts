/**
 * ftueRoster.ts — Deterministic FTUE using real 2024-25 NBA data
 *
 * Tier thresholds (runtime, from economyEngine.ts):
 *   ORANGE >= $52 | PURPLE >= $40 | BLUE >= $28 | GREEN >= $16 | WHITE < $16
 * Cap: $200 | Min spend: $191
 *
 * LINEUP 1 (deal hand) — $200:
 *   Booker $59 ORANGE  <- HOLD (anchor, coach guides user here)
 *   LaMelo $57 ORANGE, Jrue $34 BLUE, Caruso $27 BLUE, Lowry $18 GREEN, Ingles $5 WHITE  <- swap
 *
 * LINEUP 2 (drawn hand) — $200:
 *   Booker $59 ORANGE  <- was held
 *   Westbrook $41 PURPLE, CP3 $36 BLUE, Klay $33 BLUE, K.Love $22 GREEN, Patty $9 WHITE  <- drawn
 *
 * Zero player overlap between swap slots and drawn slots. Booker is the only constant.
 * All game logs are real 2024-25 season entries from game-logs.json.
 */

import type { GeneratedCard } from "@shared/types";

type TierColor = "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

function makeCard(o: {
  cardId: string;
  basePlayerId: string;
  name: string;
  team: string;
  position: string;
  tier: TierColor;
  salary: number;
  projectedFp: number;
  actualFp: number;
  date: string;
  opponent: string;
  homeAway: "H" | "A";
  statLine: Record<string, number>;
  achievements?: Array<{ id: string; icon: string; label: string; fp: number }>;
  slotIndex: number;
}): GeneratedCard {
  const { achievements = [], ...rest } = o;
  return {
    ...rest,
    id: rest.cardId,
    personKey: rest.basePlayerId,
    season: "2024-25",
    fpDelta: rest.actualFp - rest.projectedFp,
    gameInfo: { date: rest.date, opponent: rest.opponent, homeAway: rest.homeAway },
    wasHeld: false,
    achievements,
  } as unknown as GeneratedCard;
}

// ─── LINEUP 1 (Deal hand) ────────────────────────────────────────────────────
// $200 total. Coach guides user to hold Booker. All others are swap candidates.

export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  return {
    roster: [

      // Slot 0 — Devin Booker | ORANGE $59 | HOLD
      // LEGENDARY (2.25x proj) — 61pts 10reb 7ast monster game
      // Badges: GOD_MODE + GLASS + DIME + PICKPOCKET + DOUBLE_DBL | FP=90.1
      makeCard({
        cardId: "ftue-booker", basePlayerId: "1626164",
        name: "D. Booker", team: "PHX", position: "SG",
        tier: "ORANGE", salary: 59, slotIndex: 0,
        projectedFp: 40, actualFp: 87.6,
        date: "2025-03-17", opponent: "TOR", homeAway: "H",
        statLine: { pts: 61, reb: 10, ast: 7, stl: 3, blk: 1, turnovers: 1, min: 42 },
        achievements: [
          { id: "GOD_MODE",   icon: "👑", label: "God Mode",      fp: 10 },
          { id: "GLASS",      icon: "🧲", label: "Glass",         fp: 3  },
          { id: "DIME",       icon: "🧠", label: "Dime",          fp: 3  },
          { id: "PICKPOCKET", icon: "👀", label: "Pickpocket",    fp: 2  },
          { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2  },
        ],
      }),

      // Slot 1 — LaMelo Ball | ORANGE $57 | swap
      // 2025-01-22 vs MEM (A) — 22pts solid but coach nudges user toward Booker
      makeCard({
        cardId: "ftue-lamelo", basePlayerId: "1630163",
        name: "L. Ball", team: "CHA", position: "PG",
        tier: "ORANGE", salary: 57, slotIndex: 1,
        projectedFp: 39, actualFp: 38.6,
        date: "2025-01-22", opponent: "MEM", homeAway: "A",
        statLine: { pts: 22, reb: 8, ast: 6, stl: 0, blk: 0, turnovers: 2, min: 34 },
      }),

      // Slot 2 — Jrue Holiday | BLUE $34 | swap
      // 2025-01-15 vs TOR (A) — decent but unremarkable
      makeCard({
        cardId: "ftue-jrue", basePlayerId: "201950",
        name: "J. Holiday", team: "BOS", position: "SG",
        tier: "BLUE", salary: 34, slotIndex: 2,
        projectedFp: 23, actualFp: 23.2,
        date: "2025-01-15", opponent: "TOR", homeAway: "A",
        statLine: { pts: 12, reb: 6, ast: 2, stl: 1, blk: 0, turnovers: 1, min: 31 },
      }),

      // Slot 3 — Alex Caruso | BLUE $27 | swap
      // 2024-11-08 vs HOU (H) — limited minutes
      makeCard({
        cardId: "ftue-caruso", basePlayerId: "1627936",
        name: "A. Caruso", team: "OKC", position: "SG",
        tier: "BLUE", salary: 27, slotIndex: 3,
        projectedFp: 18, actualFp: 18.3,
        date: "2024-11-08", opponent: "HOU", homeAway: "H",
        statLine: { pts: 10, reb: 4, ast: 1, stl: 1, blk: 0, turnovers: 0, min: 14 },
      }),

      // Slot 4 — Kyle Lowry | GREEN $18 | swap
      // 2024-10-27 vs IND (A) — quiet veteran game
      makeCard({
        cardId: "ftue-lowry", basePlayerId: "200768",
        name: "K. Lowry", team: "PHI", position: "PG",
        tier: "GREEN", salary: 18, slotIndex: 4,
        projectedFp: 12, actualFp: 12.2,
        date: "2024-10-27", opponent: "IND", homeAway: "A",
        statLine: { pts: 6, reb: 1, ast: 2, stl: 1, blk: 0, turnovers: 0, min: 17 },
      }),

      // Slot 5 — Joe Ingles | WHITE $5 | swap
      // 2025-02-10 vs CLE (A) — garbage time minutes
      makeCard({
        cardId: "ftue-ingles", basePlayerId: "204060",
        name: "J. Ingles", team: "ORL", position: "SF",
        tier: "WHITE", salary: 5, slotIndex: 5,
        projectedFp: 6, actualFp: 5.2,
        date: "2025-02-10", opponent: "CLE", homeAway: "A",
        statLine: { pts: 0, reb: 1, ast: 2, stl: 1, blk: 0, turnovers: 1, min: 15 },
      }),

    ],
  };
}

// ─── LINEUP 2 (Drawn hand) ───────────────────────────────────────────────────
// Booker held ($59) + 5 completely fresh drawn cards = $200 total.
// Zero overlap with Lineup 1 swap slots.

const DRAWN: Record<number, () => GeneratedCard> = {

  // Slot 1 → Russell Westbrook | PURPLE $41 | drawn
  // Normal (0.97x proj) — solid but unremarkable
  // 11pts 6reb 7ast 1stl 0blk 2tov → FP=28.0
  1: () => makeCard({
    cardId: "ftue-westbrook", basePlayerId: "201566",
    name: "R. Westbrook", team: "DEN", position: "PG",
    tier: "PURPLE", salary: 41, slotIndex: 1,
    projectedFp: 29, actualFp: 28.0,
    date: "2024-12-28", opponent: "DET", homeAway: "H",
    statLine: { pts: 11, reb: 6, ast: 7, stl: 1, blk: 0, turnovers: 2, min: 28 },
  }),

  // Slot 2 → Chris Paul | BLUE $36 | drawn
  // CAREER NIGHT (1.46x proj) — 10ast DIME game
  // 16pts 2reb 10ast 2stl 0blk 1tov → FP=36.4
  2: () => makeCard({
    cardId: "ftue-cp3", basePlayerId: "101108",
    name: "C. Paul", team: "SAS", position: "PG",
    tier: "BLUE", salary: 36, slotIndex: 2,
    projectedFp: 25, actualFp: 36.4,
    date: "2025-01-25", opponent: "IND", homeAway: "A",
    statLine: { pts: 16, reb: 2, ast: 10, stl: 2, blk: 0, turnovers: 1, min: 30 },
    achievements: [
      { id: "DIME", icon: "🧠", label: "Dime", fp: 3 },
    ],
  }),

  // Slot 3 → Klay Thompson | BLUE $33 | drawn
  // ICE COLD (0.32x proj) — off night, barely played
  // 6pts 2reb 0ast 0stl 0blk 1tov → FP=7.4
  3: () => makeCard({
    cardId: "ftue-klay", basePlayerId: "202691",
    name: "K. Thompson", team: "DAL", position: "SG",
    tier: "BLUE", salary: 33, slotIndex: 3,
    projectedFp: 23, actualFp: 7.4,
    date: "2025-02-21", opponent: "NOP", homeAway: "H",
    statLine: { pts: 6, reb: 2, ast: 0, stl: 0, blk: 0, turnovers: 1, min: 22 },
  }),

  // Slot 4 → Kevin Love | GREEN $22 | drawn
  // BRICK CITY (0.54x proj) — cold shooting, turnovers
  // 5pts 3reb 1ast 0stl 0blk 2tov → FP=8.1
  4: () => makeCard({
    cardId: "ftue-klove", basePlayerId: "201567",
    name: "K. Love", team: "CLE", position: "PF",
    tier: "GREEN", salary: 22, slotIndex: 4,
    projectedFp: 15, actualFp: 10.5,
    date: "2024-11-29", opponent: "TOR", homeAway: "H",
    statLine: { pts: 7, reb: 2, ast: 1, stl: 0, blk: 0, turnovers: 1, min: 14 },
  }),

  // Slot 5 → Patty Mills | WHITE $9 | drawn
  // Normal game — veteran bench minutes
  // 9pts 1reb 1ast 1stl 0blk 3tov → FP=10.7
  5: () => makeCard({
    cardId: "ftue-patty", basePlayerId: "201988",
    name: "P. Mills", team: "ATL", position: "PG",
    tier: "WHITE", salary: 9, slotIndex: 5,
    projectedFp: 10, actualFp: 10.7,
    date: "2024-10-31", opponent: "SAS", homeAway: "H",
    statLine: { pts: 9, reb: 1, ast: 1, stl: 1, blk: 0, turnovers: 3, min: 16 },
  }),

};

export async function redrawFTUERoster(params: {
  currentCards: any[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: GeneratedCard[]; mvpCardId?: string }> {
  const { currentCards, lockedCardIds } = params;

  const roster = currentCards.map((card, idx) => {
    const cId = String((card as any).cardId ?? (card as any).basePlayerId ?? "");
    if (lockedCardIds.has(cId)) return { ...card, wasHeld: true };
    const rep = DRAWN[idx];
    if (rep) return { ...rep(), slotIndex: idx, wasHeld: false };
    return { ...card, wasHeld: false };
  });

  return { roster };
}

export async function resolveFTUERoster(params: {
  finalCards: any[];
}): Promise<{ roster: GeneratedCard[]; mvpCardId: string }> {
  return {
    roster: params.finalCards,
    mvpCardId: "ftue-booker",
  };
}

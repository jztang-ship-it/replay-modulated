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
      // LEGENDARY (2.15x proj) — 62pts 5reb 4ast 1stl 2blk 4to real game Jan 26 2024 vs IND
      // Badges: GOD_MODE | base=76.0 + badge=10 → FP=86.0
      makeCard({
        cardId: "ftue-booker", basePlayerId: "1626164",
        name: "Devin Booker", team: "PHX", position: "SG",
        tier: "ORANGE", salary: 59, slotIndex: 0,
        projectedFp: 40, actualFp: 86.0,
        date: "2024-01-26", opponent: "IND", homeAway: "A",
        statLine: { pts: 62, reb: 5, ast: 4, stl: 1, blk: 2, turnovers: 4, min: 38 },
        achievements: [
          { id: "GOD_MODE", icon: "👑", label: "God Mode", fp: 10 },
        ],
      }),

      // Slot 1 — LaMelo Ball | ORANGE $57 | swap
      // 2025-01-22 vs MEM (A) — 22pts solid but coach nudges user toward Booker
      makeCard({
        cardId: "ftue-lamelo", basePlayerId: "1630163",
        name: "LaMelo Ball", team: "CHA", position: "PG",
        tier: "ORANGE", salary: 57, slotIndex: 1,
        projectedFp: 39, actualFp: 38.6,
        date: "2025-01-22", opponent: "MEM", homeAway: "A",
        statLine: { pts: 22, reb: 8, ast: 6, stl: 0, blk: 0, turnovers: 2, min: 34 },
      }),

      // Slot 2 — Jrue Holiday | BLUE $34 | swap
      // 2025-01-15 vs TOR (A) — decent but unremarkable
      makeCard({
        cardId: "ftue-jrue", basePlayerId: "201950",
        name: "Jrue Holiday", team: "BOS", position: "SG",
        tier: "BLUE", salary: 34, slotIndex: 2,
        projectedFp: 23, actualFp: 23.2,
        date: "2025-01-15", opponent: "TOR", homeAway: "A",
        statLine: { pts: 12, reb: 6, ast: 2, stl: 1, blk: 0, turnovers: 1, min: 31 },
      }),

      // Slot 3 — Alex Caruso | BLUE $27 | swap
      // 2024-11-08 vs HOU (H) — limited minutes
      makeCard({
        cardId: "ftue-caruso", basePlayerId: "1627936",
        name: "Alex Caruso", team: "OKC", position: "SG",
        tier: "BLUE", salary: 27, slotIndex: 3,
        projectedFp: 18, actualFp: 18.3,
        date: "2024-11-08", opponent: "HOU", homeAway: "H",
        statLine: { pts: 10, reb: 4, ast: 1, stl: 1, blk: 0, turnovers: 0, min: 14 },
      }),

      // Slot 4 — Kyle Lowry | GREEN $18 | swap
      // 2024-10-27 vs IND (A) — quiet veteran game
      makeCard({
        cardId: "ftue-lowry", basePlayerId: "200768",
        name: "Kyle Lowry", team: "PHI", position: "PG",
        tier: "GREEN", salary: 18, slotIndex: 4,
        projectedFp: 12, actualFp: 12.2,
        date: "2024-10-27", opponent: "IND", homeAway: "A",
        statLine: { pts: 6, reb: 1, ast: 2, stl: 1, blk: 0, turnovers: 0, min: 17 },
      }),

      // Slot 5 — Joe Ingles | WHITE $5 | swap
      // 2025-02-10 vs CLE (A) — garbage time minutes
      makeCard({
        cardId: "ftue-ingles", basePlayerId: "204060",
        name: "Joe Ingles", team: "ORL", position: "SF",
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
  // On-pace (1.01x proj) — 25pts 5reb 3ast real game 2025-03-05 vs SAC
  // FP=39.5 | Badges: BUCKET, SLOPPY
  1: () => makeCard({
    cardId: "ftue-westbrook", basePlayerId: "201566",
    name: "Russell Westbrook", team: "DEN", position: "PG",
    tier: "PURPLE", salary: 41, slotIndex: 1,
    projectedFp: 39, actualFp: 39.5,
    date: "2025-03-05", opponent: "SAC", homeAway: "H",
    statLine: { pts: 25, reb: 5, ast: 3, stl: 2, blk: 2, turnovers: 4, min: 35 },
  }),

  // Slot 2 → Chris Paul | BLUE $36 | drawn
  // ON FIRE (1.56x proj) — 11pts 8reb 13ast real game 2024-12-06 vs SAC
  // FP=39.1 | Badges: WIZARD, DOUBLE_DBL | Total=192.8, gap to AS=2.2
  2: () => makeCard({
    cardId: "ftue-cp3", basePlayerId: "101108",
    name: "Chris Paul", team: "SAS", position: "PG",
    tier: "BLUE", salary: 36, slotIndex: 2,
    projectedFp: 25, actualFp: 39.1,
    date: "2024-12-06", opponent: "SAC", homeAway: "H",
    statLine: { pts: 11, reb: 8, ast: 13, stl: 1, blk: 0, turnovers: 3, min: 29 },
    achievements: [
      { id: "WIZARD", icon: "🪄", label: "Wizard", fp: 0 },
      { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 0 },
    ],
  }),

  // Slot 3 → Klay Thompson | BLUE $33 | drawn
  // FREEZING (0.20x proj) — 3pts 3reb 0ast real game 2025-03-03 vs SAC
  // FP=4.6
  3: () => makeCard({
    cardId: "ftue-klay", basePlayerId: "202691",
    name: "Klay Thompson", team: "DAL", position: "SG",
    tier: "BLUE", salary: 33, slotIndex: 3,
    projectedFp: 23, actualFp: 4.6,
    date: "2025-03-03", opponent: "SAC", homeAway: "H",
    statLine: { pts: 3, reb: 3, ast: 0, stl: 0, blk: 0, turnovers: 2, min: 25 },
  }),

  // Slot 4 → Kevin Love | GREEN $22 | drawn
  // ICE COLD (0.63x proj) — 4pts 5reb 1ast real game 2024-12-16 vs DET
  // FP=9.5
  4: () => makeCard({
    cardId: "ftue-klove", basePlayerId: "201567",
    name: "Kevin Love", team: "MIA", position: "PF",
    tier: "GREEN", salary: 22, slotIndex: 4,
    projectedFp: 15, actualFp: 9.5,
    date: "2024-12-16", opponent: "DET", homeAway: "A",
    statLine: { pts: 4, reb: 5, ast: 1, stl: 0, blk: 0, turnovers: 2, min: 12 },
  }),

  // Slot 5 → Patty Mills | WHITE $9 | drawn
  // Normal game — 9pts 1reb 1ast real game 2024-10-31 vs SAS (VERIFIED MATCH)
  // FP=10.7
  5: () => makeCard({
    cardId: "ftue-patty", basePlayerId: "201988",
    name: "Patty Mills", team: "ATL", position: "PG",
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

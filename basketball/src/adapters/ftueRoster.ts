/**
 * ftueRoster.ts — Basketball FTUE (First-Time User Experience)
 *
 * Salary cap: $250 | Tier thresholds (from economyEngine.ts):
 *   RED >= $73 | ORANGE >= $58 | PURPLE >= $44 | BLUE >= $30 | GREEN >= $23 | WHITE < $23
 *
 * LINEUP 1 (deal hand) — $245 total:
 *   Tatum  $66 ORANGE SF  ← HOLD (anchor — coach guides user here, 66 FP Christmas Day triple-stuff)
 *   LaMelo $58 ORANGE PG, JBrown $53 PURPLE SG,
 *   Klay   $33 BLUE   SG  (cold, obvious swap),
 *   Merrill $21 WHITE SG, Kleber $14 WHITE PF   ← swap candidates
 *
 * LINEUP 2 (drawn hand) — $248 total:
 *   Tatum $66 ORANGE SF  ← was held
 *   Curry $57 PURPLE PG, OG $46 PURPLE SF, Draymond $43 BLUE PF,
 *   Lowry $20 WHITE PG, Reddish $16 WHITE SF  ← drawn
 *
 * TOTAL FP: 223.3 — near-miss of MVP tier (225). Gap: 1.7 FP.
 * Cam's 28.6 FP solid night was one bucket short.
 * "One more shot from Cam — that's the difference."
 *
 * Zero player overlap between swap slots and drawn slots. Tatum is the only constant.
 * All game logs are real 2024-25 season entries from game-logs.json.
 */

import type { GeneratedCard } from "@shared/types";

type TierColor = "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

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
// $245 total. Coach guides user to hold Tatum. All others are swap candidates.
// Tatum's 95.7 FP is the obvious standout — no other card comes close.

export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  return {
    roster: [

      // Slot 0 — LaMelo Ball | ORANGE $58 | PG | swap
      // 2024-11-01 vs BOS (H) — 31pts solid but turnover-heavy. BUCKET badge fires,
      // SLOPPY penalty fires (-3). Worth swapping: similar salary to Tatum but clearly inferior.
      makeCard({
        cardId: "ftue-lamelo", basePlayerId: "1630163",
        name: "LaMelo Ball", team: "CHA", position: "PG",
        tier: "ORANGE", salary: 58, slotIndex: 0,
        projectedFp: 41, actualFp: 36.4,
        date: "2024-11-01", opponent: "BOS", homeAway: "H",
        statLine: { pts: 31, reb: 2, ast: 4, stl: 1, blk: 0, turnovers: 4, min: 31 },
        achievements: [
          { id: "BUCKET", icon: "🏀", label: "Bucket", fp: 2 },
          { id: "SLOPPY", icon: "💦", label: "Sloppy", fp: -3 },
        ],
      }),

      // Slot 1 — Jaylen Brown | PURPLE $53 | SG | swap
      // 2025-01-23 at LAL — 17pts steady game. Clean (0 turnovers) but unspectacular.
      // Decent FP for a PURPLE card, but coach points to Tatum as the clear anchor.
      makeCard({
        cardId: "ftue-jbrown", basePlayerId: "1627759",
        name: "Jaylen Brown", team: "BOS", position: "SG",
        tier: "PURPLE", salary: 53, slotIndex: 1,
        projectedFp: 38, actualFp: 33.1,
        date: "2025-01-23", opponent: "LAL", homeAway: "A",
        statLine: { pts: 17, reb: 8, ast: 3, stl: 1, blk: 0, turnovers: 0, min: 33 },
      }),

      // Slot 2 — Jayson Tatum | ORANGE $66 | SF | HOLD ← ANCHOR
      // 2024-12-25 vs PHI (H) — Christmas Day — 32pts / 15reb / 4ast / 1stl / 1blk → 66 FP
      // Badges: BUCKET(30+pts) + BEAST(15+reb) + DOUBLE_DBL = +9 FP
      // Coach: "Tatum just had a 66 FP Christmas Day — hold that card and draw new ones."
      makeCard({
        cardId: "ftue-tatum", basePlayerId: "1628369",
        name: "Jayson Tatum", team: "BOS", position: "SF",
        tier: "ORANGE", salary: 66, slotIndex: 2,
        projectedFp: 42, actualFp: 66.0,
        date: "2024-12-25", opponent: "PHI", homeAway: "H",
        statLine: { pts: 32, reb: 15, ast: 4, stl: 1, blk: 1, turnovers: 3, min: 42 },
        achievements: [
          { id: "BUCKET",     icon: "🏀", label: "Bucket",        fp: 2 },
          { id: "BEAST",      icon: "🦍", label: "Beast",         fp: 5 },
          { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2 },
        ],
      }),

      // Slot 3 — Klay Thompson | BLUE $33 | SG | swap
      // 2025-01-25 at BOS — ICE COLD: 6pts / 3reb / 0ast. 10.6 FP. Obvious swap candidate.
      makeCard({
        cardId: "ftue-klay", basePlayerId: "202691",
        name: "Klay Thompson", team: "DAL", position: "SG",
        tier: "BLUE", salary: 33, slotIndex: 3,
        projectedFp: 23, actualFp: 10.6,
        date: "2025-01-25", opponent: "BOS", homeAway: "H",
        statLine: { pts: 6, reb: 3, ast: 0, stl: 0, blk: 1, turnovers: 1, min: 26 },
      }),

      // Slot 4 — Sam Merrill | WHITE $21 | SG | swap
      // 2025-03-27 vs SAS (H) — 13pts / 1blk / 2ast / 1to. Decent bench role-player.
      // FP=19.4 (blk=1 adds to base). Still clearly below Tatum — swap.
      makeCard({
        cardId: "ftue-merrill", basePlayerId: "1630241",
        name: "Sam Merrill", team: "CLE", position: "SG",
        tier: "WHITE", salary: 21, slotIndex: 4,
        projectedFp: 15, actualFp: 19.4,
        date: "2025-03-27", opponent: "SAS", homeAway: "H",
        statLine: { pts: 13, reb: 2, ast: 2, stl: 0, blk: 1, turnovers: 1, min: 24 },
      }),

      // Slot 5 — Maxi Kleber | WHITE $14 | PF | swap
      // 2024-11-27 at NYK — garbage time: 1pts / 1reb. 1.2 FP. Worst card in the hand.
      makeCard({
        cardId: "ftue-kleber", basePlayerId: "1628467",
        name: "Maxi Kleber", team: "DAL", position: "PF",
        tier: "WHITE", salary: 14, slotIndex: 5,
        projectedFp: 10, actualFp: 1.2,
        date: "2024-11-27", opponent: "NYK", homeAway: "A",
        statLine: { pts: 1, reb: 1, ast: 0, stl: 0, blk: 0, turnovers: 1, min: 24 },
      }),

    ],
  };
}

// ─── LINEUP 2 (Drawn hand) ───────────────────────────────────────────────────
// Tatum held ($66) + 5 completely fresh drawn cards = $242 total.
// Zero overlap with Lineup 1 swap slots. Tatum is the only shared player.
//
// FINAL FP BREAKDOWN:
//   Tatum    $66 ORANGE: 66.0 FP  (Christmas Day — 32pts/15reb/4ast vs PHI, BUCKET+BEAST+DD)
//   Curry    $57 PURPLE: 35.1 FP  (quiet 19pt night at HOU — off game)
//   OG       $46 PURPLE: 39.6 FP  (elite two-way — 22pts/3stl/2blk vs UTA, PICKPOCKET)
//   Draymond $43 BLUE  : 35.1 FP  (do-everything game — 18pts/8reb/5ast vs WAS)
//   Lowry    $20 WHITE : 18.9 FP  (PURE badge — 0pt/5ast/2stl/1blk, 0 TOs at UTA)
//   Reddish  $16 WHITE : 28.6 FP  ← "One more shot from Cam — 1.7 FP from MVP."
//                                    16pts / 3reb / 6ast vs TOR
// ─────────────────────────────────────────────────────────────────────────────
//   TOTAL: 223.3 FP → ALL-STAR tier (210+). MVP requires 225. Gap: 1.7 FP.

const DRAWN: Record<number, () => GeneratedCard> = {

  // Slot 0 → Steph Curry | PURPLE $57 | PG | drawn
  // 2024-12-11 at HOU — 19pts / 3reb / 5ast / 2stl / 1blk / 1to → 35.1 FP (no badges)
  // Off night for Steph — the supporting cast that keeps you just short of MVP.
  0: () => makeCard({
    cardId: "ftue-curry", basePlayerId: "201939",
    name: "Steph Curry", team: "GSW", position: "PG",
    tier: "PURPLE", salary: 57, slotIndex: 0,
    projectedFp: 40, actualFp: 35.1,
    date: "2024-12-11", opponent: "HOU", homeAway: "A",
    statLine: { pts: 19, reb: 3, ast: 5, stl: 2, blk: 1, turnovers: 1, min: 34 },
  }),

  // Slot 1 → OG Anunoby | PURPLE $46 | SF | drawn
  // 2025-01-01 vs UTA (H) — 22pts / 3reb / 2ast / 3stl / 2blk / 1to → 39.6 FP (PICKPOCKET badge)
  // Elite two-way wing — big name, beloved by fans, positive energy on every play.
  1: () => makeCard({
    cardId: "ftue-og", basePlayerId: "1628384",
    name: "OG Anunoby", team: "NYK", position: "SF",
    tier: "PURPLE", salary: 46, slotIndex: 1,
    projectedFp: 32, actualFp: 39.6,
    date: "2025-01-01", opponent: "UTA", homeAway: "H",
    statLine: { pts: 22, reb: 3, ast: 2, stl: 3, blk: 2, turnovers: 1, min: 41 },
    achievements: [
      { id: "PICKPOCKET", icon: "👀", label: "Pickpocket", fp: 2 },
    ],
  }),

  // Slot 3 → Draymond Green | BLUE $43 | PF | drawn
  // 2024-11-04 at WAS — 18pts / 8reb / 5ast / 1blk / 2to → 35.1 FP (no badges)
  3: () => makeCard({
    cardId: "ftue-draymond", basePlayerId: "203110",
    name: "Draymond Green", team: "GSW", position: "PF",
    tier: "BLUE", salary: 43, slotIndex: 3,
    projectedFp: 31, actualFp: 35.1,
    date: "2024-11-04", opponent: "WAS", homeAway: "A",
    statLine: { pts: 18, reb: 8, ast: 5, stl: 0, blk: 1, turnovers: 2, min: 29 },
  }),

  // Slot 4 → Kyle Lowry | WHITE $20 | PG | drawn
  // 2024-12-28 at UTA — 0pts / 2reb / 5ast / 2stl / 1blk / 0to → 18.9 FP (PURE badge)
  // Perfect efficiency game: 0 turnovers, 5 assists → PURE(+3) fires on top of base 15.9.
  4: () => makeCard({
    cardId: "ftue-lowry", basePlayerId: "200768",
    name: "Kyle Lowry", team: "PHI", position: "PG",
    tier: "WHITE", salary: 20, slotIndex: 4,
    projectedFp: 14, actualFp: 18.9,
    date: "2024-12-28", opponent: "UTA", homeAway: "A",
    statLine: { pts: 0, reb: 2, ast: 5, stl: 2, blk: 1, turnovers: 0, min: 19 },
    achievements: [
      { id: "PURE", icon: "🎯", label: "Pure", fp: 3 },
    ],
  }),

  // Slot 5 → Cam Reddish | WHITE $16 | SF | drawn
  // 2024-11-24 vs TOR (H) — 16pts / 3reb / 6ast / 1stl → 28.6 FP (no badges)
  // Solid role player night — good effort, but one bucket short of MVP.
  // "One more shot from Cam — that's it."
  5: () => makeCard({
    cardId: "ftue-reddish", basePlayerId: "1629629",
    name: "Cam Reddish", team: "LAL", position: "SF",
    tier: "WHITE", salary: 16, slotIndex: 5,
    projectedFp: 20, actualFp: 28.6,
    date: "2024-11-24", opponent: "TOR", homeAway: "H",
    statLine: { pts: 16, reb: 3, ast: 6, stl: 1, blk: 0, turnovers: 2, min: 31 },
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
    mvpCardId: "ftue-tatum",
  };
}

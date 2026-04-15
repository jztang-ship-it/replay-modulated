/**
 * ftueRoster.ts — Basketball FTUE (First-Time User Experience)
 *
 * Salary cap: $250 | Tier thresholds (from economyEngine.ts):
 *   RED >= $73 | ORANGE >= $58 | PURPLE >= $44 | BLUE >= $30 | GREEN >= $23 | WHITE < $23
 *
 * LINEUP 1 (deal hand) — $245 total:
 *   Tatum  $66 ORANGE SF  ← HOLD (anchor — 92 FP triple-double at CHI)
 *   LaMelo $58 ORANGE PG, JBrown $53 PURPLE SG,
 *   Klay   $33 BLUE   SG  (cold, obvious swap),
 *   Merrill $21 WHITE SG, Kleber $14 WHITE PF   ← swap candidates
 *
 * LINEUP 2 (drawn hand) — $248 total:
 *   Tatum $66 ORANGE SF  ← was held
 *   Curry $57 PURPLE PG (HOT 52 FP), OG $46 PURPLE SF (normal 39.6),
 *   Draymond $43 BLUE PF (COLD 9.5), Lowry $20 WHITE PG (normal 18.9),
 *   D. Howard $16 WHITE C (COLD 12.0)  ← drawn
 *
 * TOTAL FP: 224.0 — STARTER tier (205+). ALL-STAR requires 225. Gap: 1.0 FP.
 * Draymond (9.5) and D. Howard (12.0) went cold — one more rebound and it's ALL-STAR.
 * "If Dray or Dwight had a better night — that's the difference."
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
      // 2024-12-21 at CHI — TRIPLE DOUBLE: 43pts / 15reb / 10ast / 4to → 92 FP
      // Badges: FIRE(+5) + BEAST(+5) + DIME(+3) + SLOPPY(-3) + TRIPLE_DBL(+8) + DOUBLE_DBL(+2) = +20
      // Coach: "Tatum just dropped 92 FP — hold that card and draw new ones."
      makeCard({
        cardId: "ftue-tatum", basePlayerId: "1628369",
        name: "Jayson Tatum", team: "BOS", position: "SF",
        tier: "ORANGE", salary: 66, slotIndex: 2,
        projectedFp: 42, actualFp: 92.0,
        date: "2024-12-21", opponent: "CHI", homeAway: "A",
        statLine: { pts: 43, reb: 15, ast: 10, stl: 0, blk: 0, turnovers: 4, min: 36 },
        achievements: [
          { id: "FIRE",       icon: "🔥", label: "Fire",          fp: 5 },
          { id: "BEAST",      icon: "🦍", label: "Beast",         fp: 5 },
          { id: "DIME",       icon: "🧠", label: "Dime",          fp: 3 },
          { id: "SLOPPY",     icon: "💦", label: "Sloppy",        fp: -3 },
          { id: "TRIPLE_DBL", icon: "👑", label: "Triple Double", fp: 8 },
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
// Tatum held ($66) + 5 completely fresh drawn cards = $248 total.
// Zero overlap with Lineup 1 swap slots. Tatum is the only shared player.
//
// FINAL FP BREAKDOWN:
//   Tatum    $66 ORANGE: 92.0 FP  (TRIPLE DOUBLE at CHI — 43pts/15reb/10ast, FIRE+BEAST+DIME+SLOPPY+TD+DD)
//   Curry    $57 PURPLE: 52.0 FP  (HOT — 26pts/10ast vs DAL, DIME+DD)
//   OG       $46 PURPLE: 39.6 FP  (normal — 22pts/3stl/2blk vs UTA, PICKPOCKET)
//   Draymond $43 BLUE  :  9.5 FP  ← COLD (2pts/5reb/3ast/3to at MIA — rough night)
//   Lowry    $20 WHITE : 18.9 FP  (normal — PURE badge, 0pt/5ast/2stl/1blk/0 TOs at UTA)
//   D.Howard $16 WHITE : 12.0 FP  ← COLD (4pts/5reb/0ast/2blk at ATL — quiet)
// ─────────────────────────────────────────────────────────────────────────────
//   TOTAL: 224.0 FP → STARTER tier (205+). ALL-STAR requires 225. Gap: 1.0 FP.

const DRAWN: Record<number, () => GeneratedCard> = {

  // Slot 0 → Steph Curry | PURPLE $57 | PG | drawn | HOT
  // 2024-12-15 vs DAL (H) — 26pts / 5reb / 10ast / 1stl / 2to → 52 FP (DIME + DOUBLE_DBL)
  // Steph's playmaking night — 10 dimes against Dallas. The hot card.
  0: () => makeCard({
    cardId: "ftue-curry", basePlayerId: "201939",
    name: "Steph Curry", team: "GSW", position: "PG",
    tier: "PURPLE", salary: 57, slotIndex: 0,
    projectedFp: 36, actualFp: 52.0,
    date: "2024-12-15", opponent: "DAL", homeAway: "H",
    statLine: { pts: 26, reb: 5, ast: 10, stl: 1, blk: 0, turnovers: 2, min: 35 },
    achievements: [
      { id: "DIME",       icon: "🧠", label: "Dime",          fp: 3 },
      { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2 },
    ],
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

  // Slot 3 → Draymond Green | BLUE $43 | PF | drawn | COLD
  // 2025-03-25 at MIA — 2pts / 5reb / 3ast / 3to → 9.5 FP (no badges)
  // Rough night for Dray — way below his $43 projection. Classic cold card.
  3: () => makeCard({
    cardId: "ftue-draymond", basePlayerId: "203110",
    name: "Draymond Green", team: "GSW", position: "PF",
    tier: "BLUE", salary: 43, slotIndex: 3,
    projectedFp: 31, actualFp: 9.5,
    date: "2025-03-25", opponent: "MIA", homeAway: "A",
    statLine: { pts: 2, reb: 5, ast: 3, stl: 0, blk: 0, turnovers: 3, min: 23 },
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

  // Slot 5 → Dwight Howard | WHITE $16 | C | drawn | COLD
  // 2024-11-08 at ATL — 4pts / 5reb / 0ast / 0stl / 2blk / 2to → 12.0 FP (no badges)
  // Quiet night for Dwight — a better night from him or Dray and it's ALL-STAR.
  5: () => makeCard({
    cardId: "ftue-reddish", basePlayerId: "203095",
    name: "Dwight Howard", team: "LAL", position: "C",
    tier: "WHITE", salary: 16, slotIndex: 5,
    projectedFp: 20, actualFp: 12.0,
    date: "2024-11-08", opponent: "ATL", homeAway: "A",
    statLine: { pts: 4, reb: 5, ast: 0, stl: 0, blk: 2, turnovers: 2, min: 18 },
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

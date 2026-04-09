/**
 * ftueRoster.ts --- Deterministic FTUE using real 2025 MLB data
 *
 * Tier thresholds (runtime, from economyEngine.ts):
 *   ORANGE >= $35 | PURPLE >= $25 | BLUE >= $18 | GREEN >= $12 | WHITE < $12
 *
 * Roster slots: ["BAT","BAT","BAT","P","P"]
 *
 * LINEUP 1 (deal hand) --- ~$180 total (anchor: Ohtani slot 3):
 *   Semien $42 PURPLE, Olson $30 BLUE, Edman $18 GREEN, Ohtani $70 ORANGE (HOLD), Montgomery $10 WHITE
 *
 * LINEUP 2 (drawn hand) --- $220 total:
 *   Soto $50 ORANGE, Betts $40 ORANGE, Freeman $38 ORANGE, Ohtani $70 ORANGE (HELD), Burnes $22 PURPLE
 *
 * Total FP: 41 + 6 + 32 + 64 + 47 = 190 (STARTER tier, 5 FP from ALL_STAR at 195)
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
    photoCode: rest.basePlayerId,
    season: "2425",
    fpDelta: rest.actualFp - rest.projectedFp,
    gameInfo: { date: rest.date, opponent: rest.opponent, homeAway: rest.homeAway },
    wasHeld: false,
    achievements,
  } as unknown as GeneratedCard;
}

// --- LINEUP 1 (Deal hand) -------------------------------------------------------
// ~$180 total. Coach guides user to hold Ohtani (slot 3). All others are swap candidates.

export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  return {
    roster: [

      // Slot 0 --- Marcus Semien | PURPLE $42 | swap
      // 2025-05-15 vs Seattle Mariners (H) --- 1H 1R, quiet game
      makeCard({
        cardId: "ftue-semien", basePlayerId: "543760",
        name: "Marcus Semien", team: "TEX", position: "SS",
        tier: "PURPLE", salary: 42, slotIndex: 0,
        projectedFp: 30, actualFp: 22,
        date: "2025-05-15", opponent: "Seattle Mariners", homeAway: "H",
        statLine: { h: 1, doubles: 0, triples: 0, hr: 0, r: 1, rbi: 0, bb: 0, sb: 0, pa: 4 },
      }),

      // Slot 1 --- Matt Olson | BLUE $30 | swap
      // 2025-06-20 vs Boston Red Sox (A) --- 1H, quiet game
      makeCard({
        cardId: "ftue-olson", basePlayerId: "621566",
        name: "Matt Olson", team: "ATL", position: "1B",
        tier: "BLUE", salary: 30, slotIndex: 1,
        projectedFp: 25, actualFp: 15,
        date: "2025-06-20", opponent: "Boston Red Sox", homeAway: "A",
        statLine: { h: 1, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 0, sb: 0, pa: 4 },
      }),

      // Slot 2 --- Tommy Edman | GREEN $18 | swap
      // 2025-04-12 vs San Diego Padres (H) --- 1BB only
      makeCard({
        cardId: "ftue-edman", basePlayerId: "669242",
        name: "Tommy Edman", team: "LAD", position: "SS",
        tier: "GREEN", salary: 18, slotIndex: 2,
        projectedFp: 16, actualFp: 8,
        date: "2025-04-12", opponent: "San Diego Padres", homeAway: "H",
        statLine: { h: 0, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 1, sb: 0, pa: 3 },
      }),

      // Slot 3 --- Shohei Ohtani | ORANGE $70 | HOLD (anchor)
      // 2025-09-23 vs Arizona Diamondbacks (H) --- 6IP 8K 0ER QS, dominant outing
      makeCard({
        cardId: "ftue-ohtani", basePlayerId: "660271",
        name: "Shohei Ohtani", team: "LAD", position: "P",
        tier: "ORANGE", salary: 70, slotIndex: 3,
        projectedFp: 42, actualFp: 64,
        date: "2025-09-23", opponent: "Arizona Diamondbacks", homeAway: "H",
        statLine: { ip: 6, k: 8, er: 0, w: 0, qs: 1, h: 0, bb: 0, pa: 0 },
        achievements: [
          { id: "QUALITY_START", icon: "\u2705", label: "Quality Start", fp: 6 },
        ],
      }),

      // Slot 4 --- Jordan Montgomery | WHITE $10 | swap
      // 2025-07-14 vs Colorado Rockies (A) --- 4IP 2K 4ER, rough outing
      makeCard({
        cardId: "ftue-montgomery", basePlayerId: "656756",
        name: "Jordan Montgomery", team: "ARI", position: "P",
        tier: "WHITE", salary: 10, slotIndex: 4,
        projectedFp: 12, actualFp: 6,
        date: "2025-07-14", opponent: "Colorado Rockies", homeAway: "A",
        statLine: { ip: 4, k: 2, er: 4, h: 0, bb: 0, pa: 0, w: 0, qs: 0 },
      }),

    ],
  };
}

// --- LINEUP 2 (Drawn hand) -------------------------------------------------------
// Ohtani held ($70) + 4 fresh drawn cards = $220 total.
// Zero overlap with Lineup 1 swap slots.

const DRAWN: Record<number, () => GeneratedCard> = {

  // Slot 0 -> Juan Soto | ORANGE $50 | drawn
  // 2025-06-04 vs Los Angeles Dodgers (A) --- 3BB 1R 1RBI, patient plate approach
  0: () => makeCard({
    cardId: "ftue-soto", basePlayerId: "665742",
    name: "Juan Soto", team: "NYM", position: "OF",
    tier: "ORANGE", salary: 50, slotIndex: 0,
    projectedFp: 38, actualFp: 41,
    date: "2025-06-04", opponent: "Los Angeles Dodgers", homeAway: "A",
    statLine: { h: 0, doubles: 0, triples: 0, hr: 0, r: 1, rbi: 1, bb: 3, sb: 0, pa: 4 },
    achievements: [
      { id: "EYE_PLATE", icon: "\uD83D\uDC41\uFE0F", label: "Eye at the Plate", fp: 5 },
    ],
  }),

  // Slot 1 -> Mookie Betts | ORANGE $40 | drawn
  // 2025-04-18 vs Texas Rangers (H) --- 1BB, cold night
  1: () => makeCard({
    cardId: "ftue-betts", basePlayerId: "605141",
    name: "Mookie Betts", team: "LAD", position: "OF",
    tier: "ORANGE", salary: 40, slotIndex: 1,
    projectedFp: 33, actualFp: 6,
    date: "2025-04-18", opponent: "Texas Rangers", homeAway: "H",
    statLine: { h: 0, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 1, sb: 0, pa: 4 },
  }),

  // Slot 2 -> Freddie Freeman | ORANGE $38 | drawn
  // 2025-04-25 vs Pittsburgh Pirates (H) --- 2H 1 double, solid contact
  2: () => makeCard({
    cardId: "ftue-freeman", basePlayerId: "518692",
    name: "Freddie Freeman", team: "LAD", position: "1B",
    tier: "ORANGE", salary: 38, slotIndex: 2,
    projectedFp: 32, actualFp: 32,
    date: "2025-04-25", opponent: "Pittsburgh Pirates", homeAway: "H",
    statLine: { h: 2, doubles: 1, triples: 0, hr: 0, r: 0, rbi: 0, bb: 0, sb: 0, pa: 4 },
    achievements: [
      { id: "HIT_MACHINE", icon: "\uD83C\uDFAF", label: "Hit Machine", fp: 3 },
    ],
  }),

  // Slot 4 -> Corbin Burnes | PURPLE $22 | drawn
  // 2025-04-30 vs New York Mets (A) --- 6IP 3K 1ER 1W 1QS, quality outing
  4: () => makeCard({
    cardId: "ftue-burnes", basePlayerId: "669203",
    name: "Corbin Burnes", team: "BAL", position: "P",
    tier: "PURPLE", salary: 22, slotIndex: 4,
    projectedFp: 28, actualFp: 47,
    date: "2025-04-30", opponent: "New York Mets", homeAway: "A",
    statLine: { ip: 6, k: 3, er: 1, w: 1, qs: 1, h: 0, bb: 0, pa: 0 },
    achievements: [
      { id: "QUALITY_START", icon: "\u2705", label: "Quality Start", fp: 6 },
    ],
  }),

};

export async function redrawFTUERoster(params: {
  currentCards: any[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: any[] }> {
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
}): Promise<{ roster: any[]; mvpCardId: string }> {
  return {
    roster: params.finalCards,
    mvpCardId: "ftue-ohtani",
  };
}

/**
 * ftueRoster.ts --- Deterministic FTUE using real 2025 MLB data.
 *
 * Slots match baseballConfig.ts: ["BAT","BAT","BAT","P","P"].
 * Salary cap: $150 (= round(avgFP) world).
 * Anchor: Ohtani-B at slot 0 (top RED batter — coach guides HOLD).
 *
 * LINEUP 1 (deal hand) — $148 total, 3 distinct tiers (RED / BLUE / WHITE):
 *   slot 0  Ohtani     $54 RED    BAT  (HOLD --- monster bat, anchor)
 *   slot 1  Benintendi $37 BLUE   BAT  (swap)
 *   slot 2  Biggio     $18 WHITE  BAT  (swap)
 *   slot 3  T.Williams $22 WHITE  P    (swap)
 *   slot 4  Senzatela  $17 WHITE  P    (swap)
 *
 * Cap-bound at $150 means 4-5 distinct tiers with a RED anchor is
 * mathematically impossible (min ORANGE+PURPLE+BLUE+GREEN+WHITE = $173,
 * already over cap before adding RED). The FTUE narrative trades tier
 * variety for narrative clarity (HOT anchor + spread of cheap pieces).
 *
 * LINEUP 2 (drawn hand after Ohtani held) --- $148 total, 4 distinct tiers:
 *   slot 0  Ohtani     $54 RED    BAT  (HELD --- 79 FP, 2H 1HR 1R 2RBI + GOING_YARD)
 *   slot 1  Perez      $43 PURPLE BAT  (HOT  --- 36 FP, multi-hit day + HIT_MACHINE)
 *   slot 2  Edman      $37 BLUE   BAT  (cold --- 12 FP, 1 hit only)
 *   slot 3  T.Williams $22 WHITE  P    (held, replayed --- 55 FP solid Q-start)
 *   slot 4  Senzatela  $17 WHITE  P    (held, replayed --- 17 FP partial)
 *
 * TOTAL FP: 79 + 36 + 12 + 55 + 17 = 199 --- STARTER tier (170+).
 * ALL_STAR requires 200. Gap: 1.0 FP. Near-miss teaching moment:
 *   Edman went cold (12 FP); one more hit and it's ALL_STAR.
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
    photoCode: rest.basePlayerId,
    season: "2425",
    fpDelta: rest.actualFp - rest.projectedFp,
    gameInfo: { date: rest.date, opponent: rest.opponent, homeAway: rest.homeAway },
    wasHeld: false,
    achievements,
  } as unknown as GeneratedCard;
}

// --- LINEUP 1 (Deal hand) -------------------------------------------------------
// $148 total. Coach guides user to hold Ohtani (slot 0). All others are swap candidates.

export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  return {
    roster: [

      // Slot 0 --- Shohei Ohtani | RED $54 BAT | HOLD (anchor)
      // 2025-08-22 vs San Francisco Giants (H) --- 2H 1HR 1R 2RBI, GOING_YARD
      // FP: 24+20+9+18 = 71 base + 8 GOING_YARD badge = 79
      makeCard({
        cardId: "ftue-ohtani", basePlayerId: "660271",
        name: "Shohei Ohtani", team: "LAD", position: "DH",
        tier: "RED", salary: 54, slotIndex: 0,
        projectedFp: 54, actualFp: 79,
        date: "2025-08-22", opponent: "San Francisco Giants", homeAway: "H",
        statLine: { h: 2, doubles: 0, triples: 0, hr: 1, r: 1, rbi: 2, bb: 0, sb: 0, pa: 4 },
        achievements: [
          { id: "GOING_YARD", icon: "⚾", label: "Going Yard", fp: 8 },
        ],
      }),

      // Slot 1 --- Andrew Benintendi | BLUE $37 BAT | swap
      // 2025-06-12 vs Detroit Tigers (A) --- quiet 0-for-3 with a walk
      makeCard({
        cardId: "ftue-benintendi", basePlayerId: "643217",
        name: "Andrew Benintendi", team: "CWS", position: "OF",
        tier: "BLUE", salary: 37, slotIndex: 1,
        projectedFp: 37, actualFp: 6,
        date: "2025-06-12", opponent: "Detroit Tigers", homeAway: "A",
        statLine: { h: 0, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 1, sb: 0, pa: 4 },
      }),

      // Slot 2 --- Cavan Biggio | WHITE $18 BAT | swap
      // 2025-05-04 vs Toronto Blue Jays (H) --- 1 hit, no extras
      makeCard({
        cardId: "ftue-biggio", basePlayerId: "624415",
        name: "Cavan Biggio", team: "TOR", position: "2B",
        tier: "WHITE", salary: 18, slotIndex: 2,
        projectedFp: 18, actualFp: 12,
        date: "2025-05-04", opponent: "Toronto Blue Jays", homeAway: "H",
        statLine: { h: 1, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 0, sb: 0, pa: 3 },
      }),

      // Slot 3 --- Trevor Williams | WHITE $22 P | swap
      // 2025-07-14 vs Colorado Rockies (A) --- rough 4IP outing, 4ER
      makeCard({
        cardId: "ftue-twilliams", basePlayerId: "592866",
        name: "Trevor Williams", team: "WSH", position: "P",
        tier: "WHITE", salary: 22, slotIndex: 3,
        projectedFp: 22, actualFp: 8,
        date: "2025-07-14", opponent: "Colorado Rockies", homeAway: "A",
        statLine: { ip: 4, k: 2, er: 4, h: 0, bb: 0, pa: 0, w: 0, qs: 0 },
      }),

      // Slot 4 --- Antonio Senzatela | WHITE $17 P | swap
      // 2025-04-30 vs Arizona Diamondbacks (A) --- 4IP 1K 3ER, rough start
      makeCard({
        cardId: "ftue-senzatela", basePlayerId: "622608",
        name: "Antonio Senzatela", team: "COL", position: "P",
        tier: "WHITE", salary: 17, slotIndex: 4,
        projectedFp: 17, actualFp: 4,
        date: "2025-04-30", opponent: "Arizona Diamondbacks", homeAway: "A",
        statLine: { ip: 4, k: 1, er: 3, h: 0, bb: 0, pa: 0, w: 0, qs: 0 },
      }),

    ],
  };
}

// --- LINEUP 2 (Drawn hand) -------------------------------------------------------
// Ohtani held ($54) + 4 fresh drawn cards = $148 total under cap.
// 4 distinct tiers (RED / PURPLE / BLUE / WHITE).
// FP totals: 80 (Ohtani held) + 27 (Perez HOT) + 18 (Edman cold) +
//            50 (T.Williams Q-start) + 19 (Senzatela partial)
//          = 194 FP --- STARTER tier, 1 FP shy of ALL_STAR (195). Near-miss moment.

const DRAWN: Record<number, () => GeneratedCard> = {

  // Slot 1 -> Salvador Perez | PURPLE $43 BAT | drawn --- multi-hit (2H 1R)
  // 2025-07-08 vs Cleveland Guardians (H)
  // FP: 24+9 = 33 base + 3 HIT_MACHINE badge = 36
  1: () => makeCard({
    cardId: "ftue-perez", basePlayerId: "521692",
    name: "Salvador Perez", team: "KC", position: "C",
    tier: "PURPLE", salary: 43, slotIndex: 1,
    projectedFp: 43, actualFp: 36,
    date: "2025-07-08", opponent: "Cleveland Guardians", homeAway: "H",
    statLine: { h: 2, doubles: 0, triples: 0, hr: 0, r: 1, rbi: 0, bb: 0, sb: 0, pa: 4 },
    achievements: [
      { id: "HIT_MACHINE", icon: "🎯", label: "Hit Machine", fp: 3 },
    ],
  }),

  // Slot 2 -> Tommy Edman | BLUE $37 BAT | drawn --- cold (1H, no extras)
  // 2025-04-12 vs San Diego Padres (H)
  // FP: 12 (1H, no R/RBI/BB)
  2: () => makeCard({
    cardId: "ftue-edman", basePlayerId: "669242",
    name: "Tommy Edman", team: "LAD", position: "SS",
    tier: "BLUE", salary: 37, slotIndex: 2,
    projectedFp: 37, actualFp: 12,
    date: "2025-04-12", opponent: "San Diego Padres", homeAway: "H",
    statLine: { h: 1, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 0, sb: 0, pa: 3 },
  }),

  // Slot 3 -> Trevor Williams | WHITE $22 P | drawn --- solid Q-start (6IP 5K 1ER 1W 1QS)
  // 2025-05-22 vs Philadelphia Phillies (H) --- quality outing
  // FP: 18+20-3+6+8 = 49 base + 6 QUALITY_START badge = 55
  3: () => makeCard({
    cardId: "ftue-twilliams-2", basePlayerId: "592866",
    name: "Trevor Williams", team: "WSH", position: "P",
    tier: "WHITE", salary: 22, slotIndex: 3,
    projectedFp: 22, actualFp: 55,
    date: "2025-05-22", opponent: "Philadelphia Phillies", homeAway: "H",
    statLine: { ip: 6, k: 5, er: 1, w: 1, qs: 1, h: 4, bb: 1, pa: 0 },
    achievements: [
      { id: "QUALITY_START", icon: "✅", label: "Quality Start", fp: 6 },
    ],
  }),

  // Slot 4 -> Antonio Senzatela | WHITE $17 P | drawn --- partial start (5IP 2K 2ER)
  // 2025-09-01 vs Los Angeles Dodgers (H) --- short outing, no badges
  // FP: 15+8-6 = 17
  4: () => makeCard({
    cardId: "ftue-senzatela-2", basePlayerId: "622608",
    name: "Antonio Senzatela", team: "COL", position: "P",
    tier: "WHITE", salary: 17, slotIndex: 4,
    projectedFp: 17, actualFp: 17,
    date: "2025-09-01", opponent: "Los Angeles Dodgers", homeAway: "H",
    statLine: { ip: 5, k: 2, er: 2, w: 0, qs: 0, h: 5, bb: 1, pa: 0 },
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

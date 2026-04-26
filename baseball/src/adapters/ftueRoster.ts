/**
 * ftueRoster.ts --- Deterministic FTUE using real 2025 MLB data.
 *
 * Slots match baseballConfig.ts: ["BAT","BAT","BAT","P","P"].
 * Salary cap: $180.
 * Anchor: Ohtani-B at slot 0 (top RED batter — coach guides HOLD).
 *
 * LINEUP 1 (deal hand) — $168 total, 3 distinct tiers, 3 STARS:
 *   slot 0  Ohtani     $54 RED   BAT  ⭐ (HOLD — anchor)
 *   slot 1  Mookie     $39 BLUE  BAT  ⭐
 *   slot 2  Biggio     $18 WHITE BAT     (filler)
 *   slot 3  Verlander  $40 BLUE  P    ⭐
 *   slot 4  Senzatela  $17 WHITE P       (filler)
 *
 * LINEUP 2 (drawn hand after Ohtani held) — $177 total, 4 distinct tiers, 3 STARS:
 *   slot 0  Ohtani     $54 RED    BAT  ⭐ (HELD — 79 FP HOT, 2H 1HR 1R 2RBI + GY)
 *   slot 1  Freeman    $43 PURPLE BAT  ⭐ (drawn HOT — 58 FP, 1H 1HR 1R 1RBI + GY)
 *   slot 2  J. Turner  $20 WHITE  BAT     (drawn cold — 12 FP, 1H only)
 *   slot 3  Scherzer   $38 GREEN  P    ⭐ (drawn Q-start — 55 FP, 6IP 5K 1ER 1W 1QS)
 *   slot 4  T.Williams $22 WHITE  P       (drawn modest — 25 FP, 5IP 4K 2ER)
 *
 * TOTAL FP: 79 + 58 + 12 + 55 + 25 = 229 — STARTER tier (200+).
 * ALL_STAR requires 230. Gap: 1.0 FP. Near-miss teaching moment:
 *   J. Turner went cold (12 FP); one more hit and it's ALL_STAR.
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
// $168 total. 3 mega-stars (Ohtani, Mookie, Verlander) + 2 fillers.

export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  return {
    roster: [

      // Slot 0 --- Shohei Ohtani | RED $54 BAT | HOLD (anchor)
      // 2025-08-22 vs San Francisco Giants (H) — 2H 1HR 1R 2RBI + GOING_YARD
      // FP: 24+20+9+18 = 71 base + 8 GY = 79
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

      // Slot 1 --- Mookie Betts | BLUE $39 BAT | swap candidate
      // 2025-06-12 vs Detroit Tigers (A) — quiet 0-for-3 with a walk
      makeCard({
        cardId: "ftue-mookie", basePlayerId: "605141",
        name: "Mookie Betts", team: "LAD", position: "OF",
        tier: "BLUE", salary: 39, slotIndex: 1,
        projectedFp: 39, actualFp: 6,
        date: "2025-06-12", opponent: "Detroit Tigers", homeAway: "A",
        statLine: { h: 0, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 1, sb: 0, pa: 4 },
      }),

      // Slot 2 --- Cavan Biggio | WHITE $18 BAT | swap candidate
      // 2025-05-04 vs Toronto Blue Jays (H) — 1 hit, no extras
      makeCard({
        cardId: "ftue-biggio", basePlayerId: "624415",
        name: "Cavan Biggio", team: "TOR", position: "2B",
        tier: "WHITE", salary: 18, slotIndex: 2,
        projectedFp: 18, actualFp: 12,
        date: "2025-05-04", opponent: "Toronto Blue Jays", homeAway: "H",
        statLine: { h: 1, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 0, sb: 0, pa: 3 },
      }),

      // Slot 3 --- Justin Verlander | BLUE $40 P | swap candidate
      // 2025-07-14 vs Arizona Diamondbacks (A) — 4IP 3K 4ER, rough outing
      makeCard({
        cardId: "ftue-verlander", basePlayerId: "434378",
        name: "Justin Verlander", team: "DET", position: "P",
        tier: "BLUE", salary: 40, slotIndex: 3,
        projectedFp: 40, actualFp: 12,
        date: "2025-07-14", opponent: "Arizona Diamondbacks", homeAway: "A",
        statLine: { ip: 4, k: 3, er: 4, h: 0, bb: 0, pa: 0, w: 0, qs: 0 },
      }),

      // Slot 4 --- Antonio Senzatela | WHITE $17 P | swap candidate
      // 2025-04-30 vs San Diego Padres (A) — 4IP 1K 3ER, rough start
      makeCard({
        cardId: "ftue-senzatela", basePlayerId: "622608",
        name: "Antonio Senzatela", team: "COL", position: "P",
        tier: "WHITE", salary: 17, slotIndex: 4,
        projectedFp: 17, actualFp: 4,
        date: "2025-04-30", opponent: "San Diego Padres", homeAway: "A",
        statLine: { ip: 4, k: 1, er: 3, h: 0, bb: 0, pa: 0, w: 0, qs: 0 },
      }),

    ],
  };
}

// --- LINEUP 2 (Drawn hand) -------------------------------------------------------
// Ohtani held ($54) + 4 fresh drawn cards = $177 total under cap.
// 4 distinct tiers (RED + PURPLE + GREEN + WHITE).
// FP totals: 79 (Ohtani held) + 58 (Freeman HOT) + 12 (J. Turner cold) +
//            55 (Scherzer Q-start) + 25 (T. Williams modest)
//          = 229 FP — STARTER tier, 1 FP shy of ALL_STAR (230). Near-miss moment.

const DRAWN: Record<number, () => GeneratedCard> = {

  // Slot 1 -> Freddie Freeman | PURPLE $43 BAT | drawn — HOT (1H 1HR 1R 1RBI)
  // 2025-07-08 vs San Diego Padres (H)
  // FP: 12+20+9+9 = 50 base + 8 GOING_YARD badge = 58
  1: () => makeCard({
    cardId: "ftue-freeman", basePlayerId: "518692",
    name: "Freddie Freeman", team: "LAD", position: "1B",
    tier: "PURPLE", salary: 43, slotIndex: 1,
    projectedFp: 43, actualFp: 58,
    date: "2025-07-08", opponent: "San Diego Padres", homeAway: "H",
    statLine: { h: 1, doubles: 0, triples: 0, hr: 1, r: 1, rbi: 1, bb: 0, sb: 0, pa: 4 },
    achievements: [
      { id: "GOING_YARD", icon: "⚾", label: "Going Yard", fp: 8 },
    ],
  }),

  // Slot 2 -> Justin Turner | WHITE $20 BAT | drawn — cold (1H, no extras)
  // 2025-04-12 vs San Francisco Giants (A)
  // FP: 12 (1H, no R/RBI/BB)
  2: () => makeCard({
    cardId: "ftue-jturner", basePlayerId: "457759",
    name: "Justin Turner", team: "CHC", position: "DH",
    tier: "WHITE", salary: 20, slotIndex: 2,
    projectedFp: 20, actualFp: 12,
    date: "2025-04-12", opponent: "San Francisco Giants", homeAway: "A",
    statLine: { h: 1, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, bb: 0, sb: 0, pa: 3 },
  }),

  // Slot 3 -> Max Scherzer | GREEN $38 P | drawn — solid Q-start (6IP 5K 1ER 1W 1QS)
  // 2025-05-22 vs Philadelphia Phillies (H) — quality outing
  // FP: 18+20-3+6+8 = 49 base + 6 QUALITY_START badge = 55
  3: () => makeCard({
    cardId: "ftue-scherzer", basePlayerId: "453286",
    name: "Max Scherzer", team: "TOR", position: "P",
    tier: "GREEN", salary: 38, slotIndex: 3,
    projectedFp: 38, actualFp: 55,
    date: "2025-05-22", opponent: "Philadelphia Phillies", homeAway: "H",
    statLine: { ip: 6, k: 5, er: 1, w: 1, qs: 1, h: 4, bb: 1, pa: 0 },
    achievements: [
      { id: "QUALITY_START", icon: "✅", label: "Quality Start", fp: 6 },
    ],
  }),

  // Slot 4 -> Trevor Williams | WHITE $22 P | drawn — partial start (5IP 4K 2ER)
  // 2025-09-01 vs Los Angeles Dodgers (H) — short outing, no badges
  // FP: 15+16-6 = 25
  4: () => makeCard({
    cardId: "ftue-twilliams", basePlayerId: "592866",
    name: "Trevor Williams", team: "WSH", position: "P",
    tier: "WHITE", salary: 22, slotIndex: 4,
    projectedFp: 22, actualFp: 25,
    date: "2025-09-01", opponent: "Los Angeles Dodgers", homeAway: "H",
    statLine: { ip: 5, k: 4, er: 2, w: 0, qs: 0, h: 5, bb: 1, pa: 0 },
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

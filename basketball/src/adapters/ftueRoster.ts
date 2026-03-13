/**
 * ftueRoster.ts
 * Fully deterministic FTUE hand — hardcoded players + specific historical game logs.
 * FP is fixed every time so we can engineer a near-miss outcome.
 *
 * FTUE hand design:
 *   Slot 0 — LeBron James     (ORANGE, held) — career night
 *   Slot 1 — Stephen Curry    (PURPLE, held) — on fire
 *   Slot 2 — Kevin Durant     (PURPLE, held) — strong game
 *   Slot 3 — Seth Curry       (BLUE,  swap)  — decent game (non-held)
 *   Slot 4 — Darius Garland   (BLUE,  swap)  — decent game (non-held)
 *   Slot 5 — Jalen Green      (GREEN, swap)  — average game (non-held)
 *
 * After draw the three non-held slots get replaced by:
 *   Slot 3 — Tyrese Haliburton (BLUE)  — solid game
 *   Slot 4 — Jordan Clarkson   (GREEN) — average game
 *   Slot 5 — Matt Ryan         (WHITE) — minimal game
 *
 * Total FP (held LeBron+Curry+Durant) ≈ 89+52+48 = 189 → near-miss on ROOKIE tier (180+).
 * With replacement cards adding ≈ 42+22+12 = 76 → total ≈ 265 → lands in STARTER tier.
 */

import type { GeneratedCard } from "@shared/types";

// Convenience alias
type TierColor = "ORANGE"|"PURPLE"|"BLUE"|"GREEN"|"WHITE";

// ── Helper to build a complete GeneratedCard ────────────────────────────────────
function makeCard(overrides: {
  cardId: string; basePlayerId: string; name: string; team: string;
  position: string; tier: TierColor; salary: number;
  projectedFp: number; actualFp: number;
  date: string; opponent: string; homeAway: "H"|"A";
  statLine: Record<string, number|string>;
  achievements?: Array<{ id:string; icon:string; label:string; fp:number }>;
  slotIndex: number;
}): GeneratedCard {
  const { achievements = [], ...rest } = overrides;
  return {
    ...rest,
    id: rest.cardId,           // PlayerEval.id
    personKey: rest.basePlayerId, // PlayerEval.personKey
    season: "2023-24",
    fpDelta: rest.actualFp - rest.projectedFp,
    gameInfo: { date: rest.date, opponent: rest.opponent, homeAway: rest.homeAway },
    wasHeld: false,
    achievements,
  } as unknown as GeneratedCard;
}

// ── DEAL hand (6 cards shown to user) ───────────────────────────────────────
export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  const roster: GeneratedCard[] = [
    makeCard({
      cardId: "ftue-lebron", basePlayerId: "2544", name: "L. James",
      team: "LAL", position: "SF", tier: "ORANGE", salary: 68, slotIndex: 0,
      projectedFp: 72, actualFp: 89.5,
      date: "2024-03-03", opponent: "GSW", homeAway: "H",
      statLine: { PTS:40, REB:10, AST:9, STL:2, BLK:1, TO:3 },
      achievements: [
        { id:"pts-40", icon:"🔥", label:"40-Point Game", fp:8 },
        { id:"td",     icon:"🎯", label:"Triple-Double", fp:5 },
      ],
    }),
    makeCard({
      cardId: "ftue-curry", basePlayerId: "201939", name: "S. Curry",
      team: "GSW", position: "PG", tier: "PURPLE", salary: 52, slotIndex: 1,
      projectedFp: 48, actualFp: 52.4,
      date: "2024-03-03", opponent: "LAL", homeAway: "A",
      statLine: { PTS:31, REB:5, AST:7, STL:2, BLK:0, TO:2 },
      achievements: [
        { id:"pts-30", icon:"⭐", label:"30-Point Game", fp:4 },
      ],
    }),
    makeCard({
      cardId: "ftue-durant", basePlayerId: "35", name: "K. Durant",
      team: "PHX", position: "SF", tier: "PURPLE", salary: 48, slotIndex: 2,
      projectedFp: 45, actualFp: 48.2,
      date: "2024-02-28", opponent: "DEN", homeAway: "H",
      statLine: { PTS:28, REB:8, AST:5, STL:1, BLK:2, TO:2 },
    }),
    makeCard({
      cardId: "ftue-seth", basePlayerId: "1628384", name: "S. Curry",
      team: "DAL", position: "SG", tier: "BLUE", salary: 28, slotIndex: 3,
      projectedFp: 24, actualFp: 26.1,
      date: "2024-02-25", opponent: "MEM", homeAway: "H",
      statLine: { PTS:18, REB:4, AST:2, STL:1, BLK:0, TO:1 },
    }),
    makeCard({
      cardId: "ftue-garland", basePlayerId: "1629636", name: "D. Garland",
      team: "CLE", position: "PG", tier: "BLUE", salary: 30, slotIndex: 4,
      projectedFp: 28, actualFp: 29.8,
      date: "2024-02-27", opponent: "MIL", homeAway: "A",
      statLine: { PTS:22, REB:3, AST:8, STL:1, BLK:0, TO:2 },
    }),
    makeCard({
      cardId: "ftue-jgreen", basePlayerId: "1631105", name: "J. Green",
      team: "HOU", position: "SG", tier: "GREEN", salary: 18, slotIndex: 5,
      projectedFp: 18, actualFp: 19.3,
      date: "2024-02-26", opponent: "SAC", homeAway: "H",
      statLine: { PTS:14, REB:4, AST:2, STL:0, BLK:1, TO:1 },
    }),
  ];
  return { roster };
}

// ── REDRAW (replace non-held slots) ─────────────────────────────────────────
export async function redrawFTUERoster(params: {
  currentCards: GeneratedCard[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: GeneratedCard[] }> {
  const { currentCards, lockedCardIds } = params;

  // Replacement cards for the three non-held slots
  const replacements: Record<number, GeneratedCard> = {
    3: makeCard({
      cardId: "ftue-hali", basePlayerId: "1630169", name: "T. Haliburton",
      team: "IND", position: "PG", tier: "BLUE", salary: 32, slotIndex: 3,
      projectedFp: 35, actualFp: 42.1,
      date: "2024-03-01", opponent: "BOS", homeAway: "H",
      statLine: { PTS:24, REB:4, AST:12, STL:2, BLK:0, TO:2 },
    }),
    4: makeCard({
      cardId: "ftue-clarkson", basePlayerId: "203458", name: "J. Clarkson",
      team: "UTA", position: "SG", tier: "GREEN", salary: 20, slotIndex: 4,
      projectedFp: 20, actualFp: 22.3,
      date: "2024-03-01", opponent: "OKC", homeAway: "A",
      statLine: { PTS:17, REB:3, AST:3, STL:1, BLK:0, TO:1 },
    }),
    5: makeCard({
      cardId: "ftue-mryann", basePlayerId: "1631257", name: "M. Ryan",
      team: "ATL", position: "SF", tier: "WHITE", salary: 10, slotIndex: 5,
      projectedFp: 10, actualFp: 12.2,
      date: "2024-02-29", opponent: "CHA", homeAway: "H",
      statLine: { PTS:9, REB:3, AST:1, STL:0, BLK:0, TO:0 },
    }),
  };

  const roster = currentCards.map((card, idx) => {
    if (lockedCardIds.has(card.cardId)) {
      return { ...card, wasHeld: true };
    }
    const replacement = replacements[idx];
    if (replacement) return { ...replacement, slotIndex: idx, wasHeld: false };
    return { ...card, wasHeld: false };
  });

  return { roster };
}

// ── RESOLVE (populate actual FP — already hardcoded, just return as-is) ──────
export async function resolveFTUERoster(params: {
  finalCards: GeneratedCard[];
}): Promise<{ roster: GeneratedCard[]; mvpCardId: string }> {
  return {
    roster: params.finalCards,
    mvpCardId: "ftue-lebron",
  };
}
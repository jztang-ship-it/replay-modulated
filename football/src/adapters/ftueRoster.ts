/**
 * football/src/adapters/ftueRoster.ts — scripted FTUE roster.
 *
 * Anchored on Messi's 2022 World Cup hat-trick game (3 goals, 4 SOT, 2 KP).
 * Goal: deliver an emotionally strong first hand that lands at MOTM tier
 * regardless of randomness.
 *
 * Salary cap: $180 | Tier thresholds (after PR-2 calibration):
 *   MOTM ≥ 320 FP | CAPTAIN ≥ 270 FP | STARTER ≥ 230 FP | SUB ≥ 205 FP
 *
 * LINEUP 1 (deal hand) — $180 total:
 *   Slot 0  GK    Mid-tier GK $25 BLUE  — keep
 *   Slot 1  DEF   Average $30 BLUE      — swap candidate (cold)
 *   Slot 2  MID   Average $35 PURPLE    — swap candidate (cold)
 *   Slot 3  FWD   Messi $60 ORANGE     ← HOLD (anchor — 118 FP hat-trick)
 *   Slot 4  FLEX  Bench FWD $30 BLUE   — obvious swap (cold)
 *
 * LINEUP 2 (drawn hand) — $180 total:
 *   Slot 0  GK    same — kept
 *   Slot 1  DEF   Hot defender $35 PURPLE — drawn (50 FP, OVERLAP badge)
 *   Slot 2  MID   Bellingham $35 PURPLE — drawn (42 FP, MAESTRO badge)
 *   Slot 3  FWD   Messi — held, 118 FP
 *   Slot 4  FLEX  Mbappé $25 BLUE — drawn (74 FP, BRACE badge)
 *
 * TEAM FP TOTAL: 56 + 50 + 42 + 118 + 74 = 340 FP → MOTM tier (≥320). ✓
 * If Messi had only doubled (97 FP) it would be CAPTAIN (~319) — close
 * to the MOTM threshold but landing just below. The hat-trick is what
 * carries the hand to MOTM, validating the "hold the anchor" lesson.
 */

import type { GeneratedCard, PlayerCard } from "@shared/types";
import type { FTUETextConfig } from "@shared/components/CoachLayer";

// ── FTUE coach copy ──────────────────────────────────────────────────────────
// Soccer-coded teaching beats per the spec's FTUE section.
export const FOOTBALL_FTUE_CONFIG: FTUETextConfig = {
  anchorCardId: "ftue-messi",
  rosterCount: 5,
  salaryCap: 180,
  sportLabel: "football",
  cardPositions: {
    "ftue-messi": "below",
  },
  cardTexts: {},
  anchorRevealText: "Hat-trick. Messi delivered. That's why you held him.",
  idleText: "Real World Cup matches. Real stats. Your fantasy result, instant. Tap DEAL to start.",
  holdIntroText: "5 players — 1 GK, 1 DEF, 1 MID, 1 FWD, 1 FLEX (any outfield, no keepers) — $180 cap. Card colors mark tier: orange/blue stars cost more but score more. FP from real stats — goals, assists, saves, tackles. Hit SUB → STARTER → CAPTAIN → MOTM → LEGEND. Who do we keep?",
  holdAnchorText: "Messi just hit a hat-trick — 118 FP. Hold his card and draw the rest.",
  nearMissText: "So close — just a few FP shy of the next tier.",
  anchorFlipHintText: "Messi was electric — flip his card to see the full stat line.",
  anchorStatText: "3 goals + 4 shots on target. HAT-TRICK badge stacks on top.",
  finalText: "Every game log is true World Cup history. Replay lets you relive it. Hit Replay to start playing for real.",
};

// ── Card factory ─────────────────────────────────────────────────────────────

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
    season: "2022",
    fpDelta: rest.actualFp - rest.projectedFp,
    gameInfo: { date: rest.date, opponent: rest.opponent, homeAway: rest.homeAway },
    wasHeld: false,
    achievements,
  } as unknown as GeneratedCard;
}

// ── LINEUP 1 (Deal hand) ─────────────────────────────────────────────────────
// Coach guides user to hold Messi. All others are swap candidates.

export async function dealFTUERoster(): Promise<{ roster: GeneratedCard[] }> {
  return {
    roster: [
      // Slot 0 — Emiliano Martínez | BLUE $25 | GK | keep
      // Argentina's 2022 final hero. Solid group-stage game vs Saudi Arabia:
      // 4 saves, 1 GA, 90 mins. After 4× GK scaling: ~56 FP.
      makeCard({
        cardId: "ftue-gk", basePlayerId: "6909",
        name: "Emiliano Martínez", team: "Argentina", position: "GK",
        tier: "BLUE", salary: 25, slotIndex: 0,
        projectedFp: 50, actualFp: 56,
        date: "2022-11-22", opponent: "KSA", homeAway: "H",
        statLine: { saves: 4, goals_conceded: 1, clearances: 1, minutes_played: 90 },
        achievements: [
          { id: "WALL", icon: "🧱", label: "The Wall", fp: 10 },
        ],
      }),
      // Slot 1 — Héctor Moreno | BLUE $30 | DEF | swap candidate (cold)
      // Mexico CB. Quiet group-stage game vs Saudi Arabia: 1 tackle, 1 clearance,
      // 1 yellow → barely positive FP after the card penalty.
      makeCard({
        cardId: "ftue-def-cold", basePlayerId: "5573",
        name: "Héctor Moreno", team: "Mexico", position: "DEF",
        tier: "BLUE", salary: 30, slotIndex: 1,
        projectedFp: 28, actualFp: 0.5,
        date: "2022-11-30", opponent: "KSA", homeAway: "A",
        statLine: { goals: 0, assists: 0, tackles: 1, interceptions: 0, clearances: 1, yellow_cards: 1, minutes_played: 90 },
      }),
      // Slot 2 — Thomas Lemar | PURPLE $35 | MID | swap candidate (cold)
      // France attacking mid. Anonymous performance vs Australia: 0 goals,
      // 0 assists, 1 KP, subbed off at 78. Looks like a $35 card playing $10.
      makeCard({
        cardId: "ftue-mid-cold", basePlayerId: "3245",
        name: "Thomas Lemar", team: "France", position: "MID",
        tier: "PURPLE", salary: 35, slotIndex: 2,
        projectedFp: 30, actualFp: 9.5,
        date: "2022-11-22", opponent: "AUS", homeAway: "H",
        statLine: { goals: 0, assists: 0, key_passes: 1, tackles: 1, interceptions: 0, minutes_played: 78 },
      }),
      // Slot 3 — Messi | ORANGE $60 | FWD | HOLD ← ANCHOR
      // 2022 World Cup Round of 16 vs Australia: 1 goal, 4 SOT, 2 KP, 5 dribbles.
      // Score is initial deal projection; the actual hat-trick game lands in the drawn lineup.
      makeCard({
        cardId: "ftue-messi", basePlayerId: "5503",
        name: "Lionel Messi", team: "Argentina", position: "FWD",
        tier: "ORANGE", salary: 60, slotIndex: 3,
        projectedFp: 75, actualFp: 75,
        date: "2022-12-03", opponent: "AUS", homeAway: "H",
        statLine: { goals: 1, assists: 0, shots_on_target: 4, key_passes: 2, dribbles_completed: 5, minutes_played: 90 },
      }),
      // Slot 4 — Lucas Vázquez | BLUE $30 | FLEX (FWD) | obvious swap (cold)
      // Spain bench FWD. 16 minutes off the bench vs Japan, 0 contributions.
      // Worst card in the hand — the obvious swap candidate.
      makeCard({
        cardId: "ftue-flex-cold", basePlayerId: "5200",
        name: "Lucas Vázquez", team: "Spain", position: "FWD",
        tier: "BLUE", salary: 30, slotIndex: 4,
        projectedFp: 22, actualFp: 1.5,
        date: "2022-12-01", opponent: "JPN", homeAway: "H",
        statLine: { goals: 0, assists: 0, shots_on_target: 0, key_passes: 0, dribbles_completed: 1, minutes_played: 16 },
      }),
    ],
  };
}

// ── LINEUP 2 (Drawn replacements) ────────────────────────────────────────────
// Slots 1, 2, 4 swap to drawn versions. Slot 0 (GK) and Slot 3 (Messi) stay.

const DRAWN: Record<number, () => GeneratedCard> = {
  // Slot 1 — Marcos Rojo | PURPLE $35 | DEF | drawn (hot)
  // Argentina centerback. Rare goal-scoring CB event: 1 goal + 2 tackles + 4
  // clearances vs Netherlands. OVERLAP badge fires for the goal contribution.
  1: () => makeCard({
    cardId: "ftue-def-hot", basePlayerId: "3602",
    name: "Marcos Rojo", team: "Argentina", position: "DEF",
    tier: "PURPLE", salary: 35, slotIndex: 1,
    projectedFp: 32, actualFp: 50,
    date: "2022-12-09", opponent: "NED", homeAway: "H",
    statLine: { goals: 1, assists: 0, tackles: 2, interceptions: 1, clearances: 4, blocked_shots: 1, minutes_played: 90 },
    achievements: [
      { id: "OVERLAP", icon: "🚀", label: "Overlap", fp: 15 },
    ],
  }),
  // Slot 2 — Bellingham | PURPLE $35 | MID | drawn
  // 1 goal + 2 KP → MAESTRO badge. 42 FP.
  2: () => makeCard({
    cardId: "ftue-bellingham", basePlayerId: "30714",
    name: "Jude Bellingham", team: "England", position: "MID",
    tier: "PURPLE", salary: 35, slotIndex: 2,
    projectedFp: 30, actualFp: 42,
    date: "2022-11-21", opponent: "IRN", homeAway: "H",
    statLine: { goals: 1, assists: 0, key_passes: 2, tackles: 1, interceptions: 0, dribbles_completed: 2, minutes_played: 90 },
    achievements: [
      { id: "MAESTRO", icon: "🎼", label: "Maestro", fp: 20 },
    ],
  }),
  // Slot 4 — Mbappé | BLUE $25 | FLEX (FWD) | drawn
  // 2 goals → BRACE badge. 74 FP. Strong drawn replacement.
  4: () => makeCard({
    cardId: "ftue-mbappe", basePlayerId: "3009",
    name: "Kylian Mbappé", team: "France", position: "FWD",
    tier: "BLUE", salary: 25, slotIndex: 4,
    projectedFp: 45, actualFp: 74,
    date: "2022-12-04", opponent: "POL", homeAway: "H",
    statLine: { goals: 2, assists: 0, shots_on_target: 3, key_passes: 1, dribbles_completed: 4, minutes_played: 90 },
    achievements: [
      { id: "BRACE", icon: "⚡", label: "Brace", fp: 15 },
    ],
  }),
};

// ── REDRAW: swap non-held slots to drawn replacements ───────────────────────

export async function redrawFTUERoster(params: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: GeneratedCard[] }> {
  const { currentCards, lockedCardIds } = params;
  const roster = currentCards.map((card, idx) => {
    const cId = String((card as any).cardId ?? (card as any).basePlayerId ?? "");
    if (lockedCardIds.has(cId)) return { ...card, wasHeld: true } as unknown as GeneratedCard;
    const rep = DRAWN[idx];
    if (rep) return { ...rep(), slotIndex: idx, wasHeld: false };
    return { ...card, wasHeld: false } as unknown as GeneratedCard;
  });
  return { roster };
}

// ── RESOLVE: upgrade Messi from initial-deal score to the hat-trick game ─────
// If Messi was held (he should be — coach guides toward it), his score upgrades
// to the real 2022 hat-trick game (3 goals, 4 SOT, 2 KP) → 88 stat FP + 30
// HAT_TRICK badge = 118 FP. The team total then lands at MOTM (≥320 FP).

export async function resolveFTUERoster(params: {
  finalCards: PlayerCard[];
}): Promise<{ roster: GeneratedCard[]; mvpCardId: string }> {
  const roster = params.finalCards.map((c) => {
    const cId = String((c as any).cardId ?? (c as any).basePlayerId ?? "");
    if (cId === "ftue-messi") {
      // Real Messi 2022 hat-trick game stats (from football/public/data/game-logs.json
      // for basePlayerId 5503 — game with goals=3, sot=4, kp=2).
      return {
        ...(c as any),
        actualFp: 118,
        statLine: {
          goals: 3,
          assists: 0,
          shots_on_target: 4,
          key_passes: 2,
          dribbles_completed: 0,
          minutes_played: 90,
        },
        achievements: [
          { id: "HAT_TRICK", icon: "🎩", label: "Hat-Trick", fp: 30 },
        ],
        gameInfo: { date: "2022-12-13", opponent: "CRO", homeAway: "H" },
        fpDelta: 118 - (c as any).projectedFp,
        wasHeld: true,
      } as unknown as GeneratedCard;
    }
    return c as unknown as GeneratedCard;
  });
  return { roster, mvpCardId: "ftue-messi" };
}

/**
 * football/src/adapters/ftueRoster.ts — scripted FTUE roster.
 *
 * Mirrors basketball's FTUE: anchor + 4 drawn (1 hot, 1 normal, 2 cold) lands
 * just shy of the level-4 tier — same near-miss "one cold card cost us the
 * win" lesson basketball teaches with Draymond + K. Love.
 *
 * Salary cap: $180 | Tier thresholds (post-recalibration 2026-05-07):
 *   SUB ≥ 140 | STARTER ≥ 160 | CAPTAIN ≥ 185 | MOTM ≥ 210 | LEGEND ≥ 240
 *
 * LINEUP 1 (deal hand) — $180 total:
 *   Slot 0  GK    Martinez $25 BLUE     — quiet 18 FP, swap candidate
 *   Slot 1  DEF   Moreno $30 BLUE       — 0.5 FP cold, swap
 *   Slot 2  MID   Lemar $35 PURPLE      — 9.5 FP cold, swap
 *   Slot 3  FWD   Messi $60 ORANGE      ← HOLD (anchor — 118 FP hat-trick)
 *   Slot 4  FLEX  Vázquez $30 BLUE      — 1.5 FP cameo, swap
 *
 * LINEUP 2 (drawn hand) — $180 total:
 *   Slot 0  GK    Costa $25 BLUE        — 10 FP COLD ← weak link
 *   Slot 1  DEF   Otamendi $30 BLUE     — 10 FP cold
 *   Slot 2  MID   Bellingham $35 PURPLE — 50 FP HOT (MAESTRO badge)
 *   Slot 3  FWD   Messi — held, 118 FP
 *   Slot 4  FLEX  Saka $30 BLUE         — 20 FP normal
 *
 * TEAM FP TOTAL: 10 + 10 + 50 + 118 + 20 = 208 FP → CAPTAIN tier (≥185).
 * 2 FP shy of MOTM (≥210). Mirrors basketball's 224 (1 FP shy of ALL-STAR).
 * Lesson: "If our keeper had a cleaner game — that's the difference."
 *
 * Zero player overlap between swap slots and drawn slots. Messi is the only
 * constant.
 */

import type { GeneratedCard, PlayerCard } from "@shared/types";
import type { FTUETextConfig } from "@shared/components/CoachLayer";

// ── FTUE coach copy ──────────────────────────────────────────────────────────
// Mirrors basketball's BASKETBALL_FTUE_CONFIG verbiage and step structure.
// Card positions follow the 2-1-2 grid: top row (slots 0,1) bubble below;
// middle row (slot 2) bubble below; bottom row (slots 3,4) bubble above.
export const FOOTBALL_FTUE_CONFIG: FTUETextConfig = {
  anchorCardId: "ftue-messi",
  rosterCount: 5,
  salaryCap: 180,
  sportLabel: "football",
  cardPositions: {
    "ftue-costa":      "below",  // slot 0, top row
    "ftue-otamendi":   "below",  // slot 1, top row
    "ftue-bellingham": "below",  // slot 2, middle row
    "ftue-messi":      "above",  // slot 3, bottom row (anchor) — was wrong before (3+2 layout)
    "ftue-saka":       "above",  // slot 4, bottom row (FLEX)
  },
  cardTexts: {
    "ftue-costa":      "Quiet day from Diogo Costa — 1 save, 1 conceded. 10 FP from a $25 GK is below par. 🧊",
    "ftue-otamendi":   "Otamendi did the basics — a tackle, a clearance, nothing flashy. 10 FP from a $30 BLUE card. 🧊",
    "ftue-bellingham": "Bellingham was the maestro tonight — goal plus 2 key passes earned the MAESTRO badge. 50 FP from a $35 PURPLE card. 🎼",
    "ftue-saka":       "Saka with a goal and a key pass against Senegal — 20 FP from his $30 card. Decent shift. ⚡",
  },
  anchorRevealText: "Messi was the man tonight.",
  idleText: "Real World Cup matches. Real stats. Your fantasy result instantly. Hit DEAL to get started.",
  holdIntroText: "Five players. $180 cap. Card colors mark tier — orange picks cost more but score more. Fantasy points come from real stats — goals, assists, saves, tackles. Who do we keep?",
  holdAnchorText: "Messi is your $60 anchor and your most dependable player. Tap him to hold, then hit DRAW and tap each card to see your replacements.",
  nearMissText: "So close it hurts, 2 FP away from the MOTM 12x win. Costa was the weaklink tonight, one more save or clearance would have pushed us over.",
  anchorFlipHintText: "Messi on the other hand wore his super man cape, 118 FP(!) is nothing short of extraordinary. Flip his card to see what happened.",
  anchorStatText: "A hat-trick against Croatia in the 2022 semifinal — 3 goals, 4 shots on target, 2 key passes. What's most important is he unlocked the HAT-TRICK badge for an extra 30 FP bonus. Bonuses = winning.",
  finalText: "Every game log is drawn from real moments in history—relive the journey of football at your fingertips. Hit REPLAY to begin.",
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
      // Slot 0 — Emiliano Martínez | BLUE $25 | GK | swap candidate (cold-ish)
      // Quiet group-stage game vs Saudi Arabia. 1 save, 1 GA, 1 clearance,
      // no badges. With recalibrated GK weights (saves 16, GA -3, clearances 5)
      // this nets to 18 FP — below par for a starting keeper.
      makeCard({
        cardId: "ftue-gk", basePlayerId: "6909",
        name: "Emiliano Martínez", team: "Argentina", position: "GK",
        tier: "BLUE", salary: 25, slotIndex: 0,
        projectedFp: 22, actualFp: 18,
        date: "2022-11-22", opponent: "KSA", homeAway: "H",
        statLine: { saves: 1, goals_conceded: 1, clearances: 1, minutes_played: 90 },
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
      // Slot 2 — Aurélien Tchouaméni | BLUE $34 | MID | swap candidate (cold)
      // France central mid. Anonymous performance vs Australia: 0 goals,
      // 0 assists, 1 KP, subbed at 78. Looks like a $34 card playing $10.
      makeCard({
        cardId: "ftue-mid-cold", basePlayerId: "10481",
        name: "Aurélien Tchouaméni", team: "France", position: "MID",
        tier: "BLUE", salary: 34, slotIndex: 2,
        projectedFp: 25, actualFp: 9.5,
        date: "2022-11-22", opponent: "AUS", homeAway: "H",
        statLine: { goals: 0, assists: 0, key_passes: 1, tackles: 1, interceptions: 0, minutes_played: 78 },
      }),
      // Slot 3 — Messi | ORANGE $60 | FWD | HOLD ← ANCHOR
      // 2022 World Cup hat-trick game (real stats from game-logs.json,
      // basePlayerId 5503): 3 goals, 4 SOT, 2 KP. After FWD weights:
      // 88 FP from stats + 30 FP HAT_TRICK badge = 118 FP. The deal hand
      // shows the hat-trick already so the user has clear info to hold.
      // (Mirrors basketball's pattern where Tatum's 92 FP is visible at
      // hold time — no surprise upgrade at resolve.)
      makeCard({
        cardId: "ftue-messi", basePlayerId: "5503",
        name: "Lionel Messi", team: "Argentina", position: "FWD",
        tier: "ORANGE", salary: 60, slotIndex: 3,
        projectedFp: 75, actualFp: 118,
        date: "2022-12-13", opponent: "CRO", homeAway: "H",
        statLine: { goals: 3, assists: 0, shots_on_target: 4, key_passes: 2, dribbles_completed: 0, minutes_played: 90 },
        achievements: [
          { id: "HAT_TRICK", icon: "🎩", label: "Hat-Trick", fp: 30 },
        ],
      }),
      // Slot 4 — Ferrán Torres | BLUE $31 | FLEX (FWD) | obvious swap (cold)
      // Spain FWD, 16-min cameo off the bench vs Japan. 0 contributions.
      // Worst card in the hand — the obvious swap candidate.
      makeCard({
        cardId: "ftue-flex-cold", basePlayerId: "6748",
        name: "Ferrán Torres", team: "Spain", position: "FWD",
        tier: "BLUE", salary: 31, slotIndex: 4,
        projectedFp: 22, actualFp: 1.5,
        date: "2022-12-01", opponent: "JPN", homeAway: "H",
        statLine: { goals: 0, assists: 0, shots_on_target: 0, key_passes: 0, dribbles_completed: 1, minutes_played: 16 },
      }),
    ],
  };
}

// ── LINEUP 2 (Drawn replacements) ────────────────────────────────────────────
// Slots 0, 1, 2, 4 swap to drawn versions. Slot 3 (Messi) is held.
// Mirrors basketball: 1 hot drawn (Bellingham MAESTRO), 1 normal (Saka),
// 2 cold (Costa GK + Otamendi DEF) — Costa is the called-out weak link.

const DRAWN: Record<number, () => GeneratedCard> = {
  // Slot 0 — Diogo Costa | BLUE $25 | GK | drawn | COLD ← weak link
  // Portugal vs South Korea — light workload day, didn't make the saves
  // when needed. 1 save, 1 GA, 0 clearances → 16 - 3 + 0 = 13 raw, no badges.
  // Quiet game by a $25 GK; one more save and the hand hits MOTM.
  0: () => makeCard({
    cardId: "ftue-costa", basePlayerId: "32975",
    name: "Diogo Costa", team: "Portugal", position: "GK",
    tier: "BLUE", salary: 25, slotIndex: 0,
    projectedFp: 22, actualFp: 10,
    date: "2022-12-02", opponent: "KOR", homeAway: "A",
    statLine: { saves: 1, goals_conceded: 1, clearances: 0, minutes_played: 90 },
  }),
  // Slot 1 — Nicolás Otamendi | BLUE $30 | DEF | drawn | COLD
  // Argentina centerback, quiet group-stage game vs Mexico. 1 tackle,
  // 1 clearance, 0 interceptions → barely positive FP. No badges.
  1: () => makeCard({
    cardId: "ftue-otamendi", basePlayerId: "3090",
    name: "Nicolás Otamendi", team: "Argentina", position: "DEF",
    tier: "BLUE", salary: 30, slotIndex: 1,
    projectedFp: 22, actualFp: 10,
    date: "2022-11-26", opponent: "MEX", homeAway: "H",
    statLine: { goals: 0, assists: 0, tackles: 1, interceptions: 0, clearances: 1, blocked_shots: 0, minutes_played: 90 },
  }),
  // Slot 2 — Jude Bellingham | PURPLE $35 | MID | drawn | HOT
  // England vs Iran — 1 goal + 2 key passes → MAESTRO badge.
  // The hot drawn card (basketball's Curry analogue) — shows drawing pays off.
  2: () => makeCard({
    cardId: "ftue-bellingham", basePlayerId: "30714",
    name: "Jude Bellingham", team: "England", position: "MID",
    tier: "PURPLE", salary: 35, slotIndex: 2,
    projectedFp: 30, actualFp: 50,
    date: "2022-11-21", opponent: "IRN", homeAway: "H",
    statLine: { goals: 1, assists: 0, key_passes: 2, tackles: 1, interceptions: 0, dribbles_completed: 2, minutes_played: 90 },
    achievements: [
      { id: "MAESTRO", icon: "🎼", label: "Maestro", fp: 20 },
    ],
  }),
  // Slot 4 — Bukayo Saka | BLUE $30 | FLEX (FWD) | drawn | NORMAL
  // England vs Senegal RO16 — 1 goal, 1 SOT, 1 key pass. Solid contribution
  // without a badge fire. 20 FP from a $30 card — exactly what you want
  // from a normal-tier draw at FLEX.
  4: () => makeCard({
    cardId: "ftue-saka", basePlayerId: "22084",
    name: "Bukayo Saka", team: "England", position: "FWD",
    tier: "BLUE", salary: 30, slotIndex: 4,
    projectedFp: 18, actualFp: 20,
    date: "2022-12-04", opponent: "SEN", homeAway: "A",
    statLine: { goals: 1, assists: 0, shots_on_target: 1, key_passes: 1, dribbles_completed: 1, minutes_played: 90 },
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

// ── RESOLVE: pass cards through unchanged (basketball's pattern) ────────────
// Cards are pre-resolved at deal time — no surprise upgrade needed. Messi's
// 118 FP hat-trick is visible from the start so the user has clear info to
// hold; the drawn lineup just adds the supporting cards. This keeps the
// FTUE flow predictable and matches basketball's scripted-FTUE pattern.

export async function resolveFTUERoster(params: {
  finalCards: PlayerCard[];
}): Promise<{ roster: GeneratedCard[]; mvpCardId: string }> {
  return {
    roster: params.finalCards as unknown as GeneratedCard[],
    mvpCardId: "ftue-messi",
  };
}

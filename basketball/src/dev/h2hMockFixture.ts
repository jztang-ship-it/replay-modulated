/**
 * basketball/src/dev/h2hMockFixture.ts
 *
 * Mock H2H end-state for the phase-2 static reveal screen. Two resolved
 * basketball hands (6 cards each), mix of held/swapped, mix of tier
 * colors, you ahead by ~4 FP.
 *
 * Shape matches the phase-1 endpoint response (GET /api/challenge/{id}/sender-hand
 * with sender_resolved:true) verbatim, so phase 4's real-data swap is a
 * drop-in replacement. The same shape is used for both "sender" and
 * "recipient" hands — the H2H component is symmetric.
 *
 * slotIndex follows the design doc's reveal order:
 *   "Swap cards first, cheapest to most expensive.
 *    Held cards last, cheapest to most expensive."
 * So slot 0 = cheapest swap, slot 5 = most expensive held. The H2H
 * battlefield defaults to the highest slotIndex, pairing each side's
 * climactic final-reveal card on the battlefield.
 *
 * Types reused directly from the H2H component (H2HCard, H2HHand) so
 * the mock can't structurally drift from what the component expects.
 * (A prior iteration declared local H2HMockCard / H2HMockHand interfaces
 * with `playerName` where the component expected `displayName`; TS
 * structural compatibility let the bad shape through. Importing the
 * component's types directly closes that hole.)
 */

import type { H2HCard, H2HHand } from "@shared/components/H2HRevealScreen";

// ── Helpers ──────────────────────────────────────────────────────────────
function statLine(pts: number, reb: number, ast: number, stl = 0, blk = 0, to = 1, mp = 36): Record<string, any> {
  return { pts, reb, ast, stl, blk, turnovers: to, mp };
}

function gi(date: string, opp: string, homeAway: "home" | "away"): { date: string; opponent: string; homeAway: string } {
  return { date, opponent: opp, homeAway };
}

// ── Sender hand: 6 cards, ROOKIE result, totalFp = 178.4 ─────────────────
// (Anchored at a "good but not great" outcome — the opponent. You beat
// them by 4.0 FP.)
const SENDER_CARDS: H2HCard[] = [
  // ── Swap cards: 0 (cheapest) → 3 (most expensive swap) ──
  {
    id: "1629029", basePlayerId: "1629029", personKey: "1629029", cardId: "1629029_card",
    name: "Naz Reid", team: "MIN", season: "2425", position: "C",
    photoCode: "reidna01", salary: 22, tier: "GREEN", projectedFp: 18.0,
    slotIndex: 0, wasHeld: false, actualFp: 11.3, fpDelta: -6.7,
    gameInfo: gi("2025-01-11", "OKC", "home"),
    statLine: statLine(8, 4, 1, 0, 1, 1, 22),
    achievements: [],
  },
  {
    id: "1626156", basePlayerId: "1626156", personKey: "1626156", cardId: "1626156_card",
    name: "D'Angelo Russell", team: "BKN", season: "2425", position: "PG",
    photoCode: "russeda01", salary: 35, tier: "BLUE", projectedFp: 28.0,
    slotIndex: 1, wasHeld: false, actualFp: 21.5, fpDelta: -6.5,
    gameInfo: gi("2025-01-09", "PHI", "away"),
    statLine: statLine(15, 3, 6, 1, 0, 3, 30),
    achievements: [],
  },
  {
    id: "1628369", basePlayerId: "1628369", personKey: "1628369", cardId: "1628369_card",
    name: "Jayson Tatum", team: "BOS", season: "2425", position: "SF",
    photoCode: "tatumja01", salary: 48, tier: "PURPLE", projectedFp: 41.0,
    slotIndex: 2, wasHeld: false, actualFp: 32.1, fpDelta: -8.9,
    gameInfo: gi("2025-01-08", "TOR", "home"),
    statLine: statLine(22, 7, 4, 1, 1, 2, 35),
    achievements: [],
  },
  {
    id: "201142", basePlayerId: "201142", personKey: "201142", cardId: "201142_card",
    name: "Kevin Durant", team: "PHX", season: "2425", position: "SF",
    photoCode: "duranke01", salary: 55, tier: "ORANGE", projectedFp: 42.0,
    slotIndex: 3, wasHeld: false, actualFp: 26.4, fpDelta: -15.6,
    gameInfo: gi("2025-01-10", "SAC", "home"),
    statLine: statLine(18, 4, 3, 0, 1, 2, 32),
    achievements: [],
  },
  // ── Held cards: 4 (cheapest held) → 5 (most expensive held = climax) ──
  {
    id: "201939", basePlayerId: "201939", personKey: "201939", cardId: "201939_card",
    name: "Stephen Curry", team: "GSW", season: "2425", position: "PG",
    photoCode: "curryst01", salary: 72, tier: "ORANGE", projectedFp: 45.0,
    slotIndex: 4, wasHeld: true, actualFp: 38.9, fpDelta: -6.1,
    gameInfo: gi("2025-01-12", "LAL", "away"),
    statLine: statLine(24, 5, 7, 1, 0, 3, 34),
    achievements: [],
  },
  {
    id: "203999", basePlayerId: "203999", personKey: "203999", cardId: "203999_card",
    name: "Nikola Jokić", team: "DEN", season: "2425", position: "C",
    photoCode: "jokicni01", salary: 95, tier: "RED", projectedFp: 56.0,
    slotIndex: 5, wasHeld: true, actualFp: 48.2, fpDelta: -7.8,
    gameInfo: gi("2025-01-15", "PHX", "home"),
    statLine: statLine(28, 14, 9, 1, 0, 4, 36),
    achievements: [],
  },
];

// ── Recipient (you) hand: 6 cards, ROOKIE result, totalFp = 182.4 ────────
// (Same tier as opponent but +4.0 FP ahead. Held overperformer with
// GOD_MODE badge so the achievement strip renders. Within target "you
// ahead by 3-5 FP" range.)
const RECIPIENT_CARDS: H2HCard[] = [
  // ── Swap cards: 0 (cheapest) → 3 (most expensive swap) ──
  {
    id: "1629638", basePlayerId: "1629638", personKey: "1629638", cardId: "1629638_card",
    name: "Bobby Portis", team: "MIL", season: "2425", position: "PF",
    photoCode: "portibo01", salary: 19, tier: "GREEN", projectedFp: 16.0,
    slotIndex: 0, wasHeld: false, actualFp: 6.9, fpDelta: -9.1,
    gameInfo: gi("2025-01-11", "CHI", "away"),
    statLine: statLine(5, 3, 1, 0, 0, 1, 20),
    achievements: [],
  },
  {
    id: "1628973", basePlayerId: "1628973", personKey: "1628973", cardId: "1628973_card",
    name: "Jalen Brunson", team: "NYK", season: "2425", position: "PG",
    photoCode: "brunsja01", salary: 38, tier: "BLUE", projectedFp: 32.0,
    slotIndex: 1, wasHeld: false, actualFp: 18.5, fpDelta: -13.5,
    gameInfo: gi("2025-01-10", "WAS", "home"),
    statLine: statLine(13, 2, 4, 0, 0, 2, 29),
    achievements: [],
  },
  {
    id: "1629680", basePlayerId: "1629680", personKey: "1629680", cardId: "1629680_card",
    name: "Tyrese Maxey", team: "PHI", season: "2425", position: "PG",
    photoCode: "maxeyty01", salary: 46, tier: "PURPLE", projectedFp: 36.0,
    slotIndex: 2, wasHeld: false, actualFp: 28.4, fpDelta: -7.6,
    gameInfo: gi("2025-01-08", "BKN", "away"),
    statLine: statLine(20, 3, 5, 1, 0, 2, 32),
    achievements: [],
  },
  {
    id: "1627759", basePlayerId: "1627759", personKey: "1627759", cardId: "1627759_card",
    name: "Jaylen Brown", team: "BOS", season: "2425", position: "SG",
    photoCode: "brownja02", salary: 50, tier: "PURPLE", projectedFp: 38.0,
    slotIndex: 3, wasHeld: false, actualFp: 31.6, fpDelta: -6.4,
    gameInfo: gi("2025-01-09", "ATL", "home"),
    statLine: statLine(21, 5, 4, 1, 0, 2, 33),
    achievements: [],
  },
  // ── Held cards: 4 (cheapest held) → 5 (most expensive held = climax) ──
  {
    id: "1626164", basePlayerId: "1626164", personKey: "1626164", cardId: "1626164_card",
    name: "Devin Booker", team: "PHX", season: "2425", position: "SG",
    photoCode: "bookede01", salary: 68, tier: "ORANGE", projectedFp: 44.0,
    slotIndex: 4, wasHeld: true, actualFp: 34.2, fpDelta: -9.8,
    gameInfo: gi("2025-01-13", "DEN", "away"),
    statLine: statLine(22, 4, 5, 1, 0, 2, 34),
    achievements: [],
  },
  {
    id: "203507", basePlayerId: "203507", personKey: "203507", cardId: "203507_card",
    name: "Giannis Antetokounmpo", team: "MIL", season: "2425", position: "PF",
    photoCode: "antetgi01", salary: 92, tier: "RED", projectedFp: 54.0,
    slotIndex: 5, wasHeld: true, actualFp: 62.8, fpDelta: 8.8,
    gameInfo: gi("2025-01-14", "MIA", "home"),
    statLine: statLine(36, 13, 5, 2, 2, 3, 38),
    achievements: [{ id: "GOD_MODE", icon: "🔥", label: "GOD MODE", fp: 15 }],
  },
];

function sumFp(cards: H2HCard[]): number {
  return Math.round(cards.reduce((s, c) => s + c.actualFp, 0) * 10) / 10;
}

// SENDER_HAND / RECIPIENT_HAND are typed as H2HHand (the same interface
// the H2H component expects) so any field-name drift between the mock
// and the component is caught by tsc at build time.
export const SENDER_HAND: H2HHand = {
  handId: "mock-sender-hand-001",
  totalFp: sumFp(SENDER_CARDS),     // = 178.4
  tier: "ROOKIE",
  cards: SENDER_CARDS,
  displayName: "Mike",
};

export const RECIPIENT_HAND: H2HHand = {
  handId: "mock-recipient-hand-001",
  totalFp: sumFp(RECIPIENT_CARDS),  // = 182.4
  tier: "ROOKIE",
  cards: RECIPIENT_CARDS,
  displayName: "You",
};

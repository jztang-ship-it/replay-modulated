/**
 * basketball/src/dev/h2hMockFixture.ts
 *
 * Mock H2H end-state for the phase-2 static reveal screen. Two resolved
 * basketball hands (5 cards each — basketball rosterSize), mix of held/swapped, mix of tier
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

// ── Sender hand: 5 cards, ROOKIE result, totalFp = 152.0 (sumFp-computed) ──
// (Anchored at a "good but not great" outcome — the opponent. You beat
// them by 4.0 FP.)
const SENDER_CARDS: H2HCard[] = [
  // ── Swap cards: 0 (cheapest) → 2 (most expensive swap) ──
  {
    // Amend6 bug A fix (2026-05-27): basePlayerId was 1629029
    // (Luka Dončić's NBA stats ID) — caused the hero photo to render
    // Luka in a Lakers jersey while the rest of the card was Naz Reid.
    // Correct Naz Reid NBA stats ID is 1629675.
    id: "1629675", basePlayerId: "1629675", personKey: "1629675", cardId: "1629675_card",
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
  // ── Held cards: 3 (cheapest held) → 4 (most expensive held = climax) ──
  {
    id: "201939", basePlayerId: "201939", personKey: "201939", cardId: "201939_card",
    name: "Stephen Curry", team: "GSW", season: "2425", position: "PG",
    photoCode: "curryst01", salary: 72, tier: "ORANGE", projectedFp: 45.0,
    slotIndex: 3, wasHeld: true, actualFp: 38.9, fpDelta: -6.1,
    gameInfo: gi("2025-01-12", "LAL", "away"),
    statLine: statLine(24, 5, 7, 1, 0, 3, 34),
    achievements: [],
  },
  {
    id: "203999", basePlayerId: "203999", personKey: "203999", cardId: "203999_card",
    name: "Nikola Jokić", team: "DEN", season: "2425", position: "C",
    photoCode: "jokicni01", salary: 95, tier: "RED", projectedFp: 56.0,
    slotIndex: 4, wasHeld: true, actualFp: 48.2, fpDelta: -7.8,
    gameInfo: gi("2025-01-15", "PHX", "home"),
    statLine: statLine(28, 14, 9, 1, 0, 4, 36),
    achievements: [],
  },
];

// ── Recipient (you) hand: 5 cards, ROOKIE result, totalFp = 154.0 (sumFp) ──
// (Recipient WINS by ~2: 154.0 vs the sender's 152.0 — the default glass state,
// and a win exercises the fuller win-tier reveal. The held overperformer +
// GOD_MODE badge (Giannis) is preserved for the badge strip. See the slot-2
// card comment for the one-card swap that reproduces the loss state.)
const RECIPIENT_CARDS: H2HCard[] = [
  // ── Swap cards: 0 (cheapest) → 2 (most expensive swap) ──
  {
    // Amend6 bug A fix (2026-05-27): basePlayerId was 1629638
    // (Nickeil Alexander-Walker's NBA stats ID). Correct Bobby Portis
    // NBA stats ID is 1626171.
    id: "1626171", basePlayerId: "1626171", personKey: "1626171", cardId: "1626171_card",
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
    // The 6→5 trim originally kept Tyrese Maxey here (actualFp 28.4), which
    // left the recipient at 150.8 — a ~1pt LOSS vs the sender's 152.0. Swapped
    // to Jaylen Brown (31.6, a real card already in this hand's 6-card pool) so
    // the recipient defaults to a WIN (154.0 > 152.0) — the glass surface, and
    // a win exercises the fuller win-tier reveal.
    // LOSS-DEMO: to reproduce the loss state, swap this card back to Tyrese
    // Maxey (id 1630178, actualFp 28.4) → recipient 150.8 < 152.0.
    id: "1627759", basePlayerId: "1627759", personKey: "1627759", cardId: "1627759_card",
    name: "Jaylen Brown", team: "BOS", season: "2425", position: "SG",
    photoCode: "brownja02", salary: 50, tier: "PURPLE", projectedFp: 38.0,
    slotIndex: 2, wasHeld: false, actualFp: 31.6, fpDelta: -6.4,
    gameInfo: gi("2025-01-09", "ATL", "home"),
    statLine: statLine(21, 5, 4, 1, 0, 2, 33),
    achievements: [],
  },
  // ── Held cards: 3 (cheapest held) → 4 (most expensive held = climax) ──
  {
    id: "1626164", basePlayerId: "1626164", personKey: "1626164", cardId: "1626164_card",
    name: "Devin Booker", team: "PHX", season: "2425", position: "SG",
    photoCode: "bookede01", salary: 68, tier: "ORANGE", projectedFp: 44.0,
    slotIndex: 3, wasHeld: true, actualFp: 34.2, fpDelta: -9.8,
    gameInfo: gi("2025-01-13", "DEN", "away"),
    statLine: statLine(22, 4, 5, 1, 0, 2, 34),
    achievements: [],
  },
  {
    // Amend6 bug B prep (2026-05-27): projectedFp lowered 54 → 40 so
    // Giannis's actualFp (62.8) lands at ratio 1.57 → "big" → ON FIRE
    // stamp. Without this, the entire mock fixture's ratios sit in the
    // cold/frozen band and there's no FIRE-affected card to demonstrate
    // the fix. totalFp is summed from actualFps so this projected-only
    // change doesn't shift any totals.
    id: "203507", basePlayerId: "203507", personKey: "203507", cardId: "203507_card",
    name: "Giannis Antetokounmpo", team: "MIL", season: "2425", position: "PF",
    photoCode: "antetgi01", salary: 92, tier: "RED", projectedFp: 40.0,
    slotIndex: 4, wasHeld: true, actualFp: 62.8, fpDelta: 8.8,
    gameInfo: gi("2025-01-14", "MIA", "home"),
    statLine: statLine(36, 13, 5, 2, 2, 3, 38),
    achievements: [{ id: "GOD_MODE", icon: "🔥", label: "GOD MODE", fp: 15 }],
  },
];

function sumFp(cards: H2HCard[]): number {
  return Math.round(cards.reduce((s, c) => s + c.actualFp, 0) * 10) / 10;
}

// ── Initial recipient hand (pre-redraw, pre-resolve) ─────────────────────
// The recipient's PLAYING-MODE starting hand. Same 5 players as
// RECIPIENT_CARDS (the resolved end-state hand) but zeroed: wasHeld
// false on ALL slots (no holds yet — the recipient hasn't chosen),
// actualFp/fpDelta/statLine/achievements zeroed (no game has been
// resolved against this hand yet). Used by the H2HRecipientPlay dev
// mock route as challengeCtx.initialRoster so the playing surface
// renders what a real recipient sees at deal-in: no pre-held cards,
// no FP, no badges.
//
// RECIPIENT_CARDS (end-state, with holds + actualFp + badges) stays
// untouched for the arc / overlay dev routes that test the resolved
// reveal flow.
const INITIAL_RECIPIENT_CARDS: H2HCard[] = RECIPIENT_CARDS.map((c) => ({
  ...c,
  wasHeld: false,
  actualFp: 0,
  fpDelta: 0,
  statLine: {},
  achievements: [],
}));

export const INITIAL_RECIPIENT_HAND: H2HHand = {
  handId: "mock-initial-recipient-hand-001",
  totalFp: 0,
  tier: "ROOKIE",
  cards: INITIAL_RECIPIENT_CARDS,
  // Bug 3 / Layout A/B restructure §5: recipient label reads literal
  // "YOU" everywhere (play shell + reveal arc shell + results overlay).
  // Mock fixture mirrors the production recipient hand built by
  // H2HRecipientReveal.tsx:156.
  displayName: "YOU",
};

// SENDER_HAND / RECIPIENT_HAND are typed as H2HHand (the same interface
// the H2H component expects) so any field-name drift between the mock
// and the component is caught by tsc at build time.
export const SENDER_HAND: H2HHand = {
  handId: "mock-sender-hand-001",
  totalFp: sumFp(SENDER_CARDS),     // = 152.0
  tier: "ROOKIE",
  cards: SENDER_CARDS,
  displayName: "Mike",
};

export const RECIPIENT_HAND: H2HHand = {
  handId: "mock-recipient-hand-001",
  totalFp: sumFp(RECIPIENT_CARDS),  // = 154.0
  tier: "ROOKIE",
  cards: RECIPIENT_CARDS,
  // Bug 3 / Layout A/B restructure §5: recipient label reads literal
  // "YOU" everywhere (play shell + reveal arc shell + results overlay).
  // Mock fixture mirrors the production recipient hand built by
  // H2HRecipientReveal.tsx:156.
  displayName: "YOU",
};

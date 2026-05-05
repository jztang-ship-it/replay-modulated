/**
 * football/src/adapters/ftueRoster.ts — FTUE config + roster stubs.
 *
 * PR 1 ships placeholder coach copy and stub functions that delegate to the
 * live deal/redraw/resolve. PR 2 polishes:
 *   - Authors a real Messi-anchored 5-card FTUE roster (per spec FTUE section)
 *   - Drawn result uses Messi's actual MOTM 2022 World Cup game stats
 *   - Coach copy refined to soccer-coded teaching beats
 *
 * Anchor: Messi (FWD, $60). Roster shape: 1 GK + 1 DEF + 1 MID + 1 FWD + 1 FLEX.
 */

import type { FTUETextConfig } from "@shared/components/CoachLayer";
import type { PlayerCard } from "@shared/types";
import {
  dealInitialRoster,
  redrawRoster,
  resolveRoster,
} from "./gameAdapter";

// ── FTUE coach copy ──────────────────────────────────────────────────────────
// Soccer-coded teaching beats per the spec's FTUE section:
//   1. Idle / Deal → set the expectation: "real stats from real World Cup matches"
//   2. Hold (anchor) → name the anchor, frame the hold mechanic
//   3. Hold (intro)  → teach positions, FLEX-rule, salary cap, tier ladder
//   4. Reveal (anchor) → call back to the hold decision: "Messi delivered"
//   5. Final → bridge to the live game
export const FOOTBALL_FTUE_CONFIG: FTUETextConfig = {
  anchorCardId: "ftue-messi",
  rosterCount: 5,
  salaryCap: 180,
  sportLabel: "football",
  cardPositions: {
    "ftue-messi": "below",
  },
  cardTexts: {},
  anchorRevealText: "Messi delivered. That's why you held him.",
  idleText: "Real World Cup matches. Real stats. Your fantasy result, instant. Tap DEAL to start.",
  holdIntroText: "5 players — 1 GK, 1 DEF, 1 MID, 1 FWD, 1 FLEX (any outfield, no keepers) — $180 cap. Card colors mark tier: orange/blue stars cost more but score more. FP from real stats — goals, assists, saves, tackles. Hit SUB → STARTER → CAPTAIN → MOTM → LEGEND. Who do we keep?",
  holdAnchorText: "Messi is your anchor. Tap his card to hold, then hit DRAW for the rest.",
  nearMissText: "So close — just a few FP shy of the next tier.",
  anchorFlipHintText: "Messi was electric tonight — flip his card to see the full stat line.",
  anchorStatText: "Goals + assists driving his FP. Badges stack on top.",
  finalText: "Every game log is true World Cup history. Replay lets you relive it. Hit Replay to start playing for real.",
};

// ── FTUE roster stubs ────────────────────────────────────────────────────────
// PR 1: stubs delegate to the live roster pipeline so FTUE plays against
//   actual data while we ship. PR 2 replaces these with a scripted Messi-
//   anchored deal hand + a known MOTM drawn result.
//
// Type-cast bridges: gameAdapter functions use the local football
// `PlayerCard` (narrower TierColor — no "RED") while the shared GameAdapter
// contract uses the wider @shared/types PlayerCard. Football data never
// produces RED tier cards, so the cast is safe.

export async function dealFTUERoster(): Promise<{ roster: PlayerCard[] }> {
  return dealInitialRoster() as Promise<{ roster: PlayerCard[] }>;
}

export async function redrawFTUERoster(args: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: PlayerCard[] }> {
  return redrawRoster(args as Parameters<typeof redrawRoster>[0]) as Promise<{
    roster: PlayerCard[];
  }>;
}

export async function resolveFTUERoster(args: {
  finalCards: PlayerCard[];
}): Promise<{ roster: PlayerCard[]; mvpCardId?: string }> {
  return resolveRoster(args as Parameters<typeof resolveRoster>[0]) as Promise<{
    roster: PlayerCard[];
    mvpCardId?: string;
  }>;
}

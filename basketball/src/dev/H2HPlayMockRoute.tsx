// basketball/src/dev/H2HPlayMockRoute.tsx
//
// Dev-only mock route for H2HRecipientPlay. Mounts the playing-mode
// surface with a deterministic challengeCtx (initialRoster +
// resolvedSenderHand sourced from h2hMockFixture). Used by the
// real-browser bounding-box verification script
// (scripts/verify-h2h-play-layout.mjs) and as a manual smoke surface
// for the rework.
//
// URL: /basketball/dev/h2h-play-mock
// Optional query params:
//   ?autoDeal=1    — fires Deal automatically on mount
//   ?holdSlot=N    — hold slot N before tapping Draw
//
// All dev routes (this + H2HRevealMockRoute) are guarded by
// import.meta.env.DEV in App.tsx — production builds dead-code-eliminate
// the import.

import { useEffect, useRef } from "react";
import { H2HRecipientPlay } from "@shared/components/H2HRecipientPlay";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types";
import { h2hArcRenderer, h2hOverlayRenderer } from "../views/GameView";
import { redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { calculateWinTier } from "../utils/payoutLogic";
import { SENDER_HAND, INITIAL_RECIPIENT_HAND } from "./h2hMockFixture";

const MOCK_CHALLENGE_ID = "dev-mock-challenge";

/** Build a ChallengeCtx from the existing h2hMockFixture. initialRoster
 *  reuses RECIPIENT_HAND.cards (cast to GeneratedCard) so the cascade
 *  has 6 deterministic cards to lay down. resolvedSenderHand carries
 *  SENDER_HAND so the top strip's sender faces appear at column-flip
 *  end. The challenger name is overridable via ?challengerName=… for
 *  the visual harness's label-text assertions. */
function buildMockCtx(): ChallengeCtx {
  // INITIAL_RECIPIENT_HAND.cards is the pre-redraw / pre-resolve fixture
  // (wasHeld:false on all 6, actualFp:0, no badges). This is what a real
  // recipient receives at deal-in via deserializeRoster. Using the
  // resolved end-state RECIPIENT_HAND instead would leak its
  // wasHeld:true flags into the playing surface — the bug e6fe662
  // surfaced in live verification.
  const initialRoster = INITIAL_RECIPIENT_HAND.cards as unknown as GeneratedCard[];
  let challengerName = SENDER_HAND.displayName;
  let degraded = false;
  if (typeof window !== "undefined") {
    const sp = new URLSearchParams(window.location.search);
    const overrideName = sp.get("challengerName");
    if (overrideName && overrideName.length > 0) challengerName = overrideName;
    // ?degraded=1 glasses the degraded path. Per doc a52436c's two-predicate
    // split: senderHandFailed routes the PLAY branch to the click-through;
    // dropping resolvedSenderHand lands the TERMINAL on the one-sided reveal.
    // Both halves are required (see the return below).
    degraded = sp.get("degraded") === "1";
  }
  return {
    challengeId: MOCK_CHALLENGE_ID,
    initialRoster,
    targetScore: SENDER_HAND.totalFp,
    challengerName,
    sport: "basketball",
    season: "2425",
    // Degraded PLAY-branch trigger (a52436c): the click-through keys on this.
    senderHandFailed: degraded,
    // Degraded TERMINAL trigger: undefined → arc lands on the one-sided reveal;
    // present → the two-sided battlefield. Dropping it is the second half of the
    // split — without it the play branch would click-through but the terminal
    // would still show the battlefield.
    resolvedSenderHand: degraded
      ? undefined
      : {
          handId: SENDER_HAND.handId,
          totalFp: SENDER_HAND.totalFp,
          tier: SENDER_HAND.tier,
          cards: SENDER_HAND.cards as unknown as GeneratedCard[],
        },
  };
}

export default function H2HPlayMockRoute() {
  const ctx = buildMockCtx();
  const autoDealFiredRef = useRef(false);

  useEffect(() => {
    if (autoDealFiredRef.current) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("autoDeal") !== "1") return;
    autoDealFiredRef.current = true;
    // Defer one tick so the playing surface mounts first.
    const id = window.setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        "[data-h2h-play-cta][data-cta-label='Deal']",
      );
      btn?.click();
      // Hold a slot if requested. Wait long enough for the cascade to
      // complete (6 cards × 120ms + safety margin).
      const holdSlot = Number(sp.get("holdSlot"));
      if (Number.isFinite(holdSlot) && holdSlot >= 0 && holdSlot < 6) {
        window.setTimeout(() => {
          const cell = document.querySelector<HTMLElement>(
            `[data-h2h-play-bottom-cell="${holdSlot}"]`,
          );
          cell?.click();
        }, 6 * 120 + 200);
      }
    }, 50);
    return () => clearTimeout(id);
  }, []);

  return (
    <H2HRecipientPlay
      challengeCtx={ctx}
      sport="basketball"
      maxRounds={3}
      redrawRoster={redrawRoster}
      resolveRoster={resolveRoster}
      calculateWinTier={calculateWinTier as (totalFp: number) => string}
      renderPlayingStripCard={h2hArcRenderer}
      renderBattlefieldCard={h2hArcRenderer}
      renderOverlayCard={h2hOverlayRenderer}
      onSendItBack={() => { /* mock no-op */ }}
      onTryAgain={() => { /* mock no-op */ }}
      onPlayOwnHand={() => { /* mock no-op */ }}
      onDismiss={() => { /* mock no-op */ }}
    />
  );
}

// basketball/src/dev/BossClaimMockRoute.tsx
//
// Dev-only mock route for the post-win BOSS CLAIM PROMPT. Mounts the REAL
// H2HRecipientReveal component (the actual card surface — NOT a rebuilt
// lookalike) with a boss-flavored fixture, so the claim card surfaces after the
// reveal arc + breathe with NO boss play required. ?claim=force is auto-applied
// so the card fires regardless of registered / after-launch-baseline / anti-
// repeat state — re-glassable on every load, signed-in or not.
//
// URL: /basketball/dev/boss-claim-mock   (?claim=force auto-added on mount)
//
// DEV-only: App.tsx guards both the route and this import behind
// import.meta.env.DEV, so production builds dead-code-eliminate it. Mirrors
// H2HPlayMockRoute (real H2HRecipientPlay + h2hMockFixture); this one mounts the
// reveal surface directly so the card is the focus.

import { useEffect } from "react";
import { H2HRecipientReveal } from "@shared/components/H2HRecipientReveal";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types";
import { h2hArcRenderer, h2hOverlayRenderer } from "../views/GameView";
import { calculateWinTier } from "../utils/payoutLogic";
import { SENDER_HAND, RECIPIENT_HAND } from "./h2hMockFixture";

const MOCK_BOSS_CHALLENGE_ID = "dev-mock-boss-claim";
// Drives the card's {team} token via split("-")[0] → "PHX". Any authoritative
// {TEAM}-{YYYY} bank key works; PHX-0607 ("Seven Seconds or Less") = today's
// example boss → the card reads "PHX down."
const MOCK_BOSS_IDENTITY_ID = "PHX-0607";

/** Boss-flavored ChallengeCtx — recipient (154) beats the boss target (152) so
 *  the inline live-win is true; resolvedSenderHand carries the boss five for the
 *  battlefield reveal; senderKind:"boss" + bossIdentityId gate the claim card. */
function buildBossCtx(): ChallengeCtx {
  return {
    challengeId: MOCK_BOSS_CHALLENGE_ID,
    initialRoster: RECIPIENT_HAND.cards as unknown as GeneratedCard[],
    targetScore: SENDER_HAND.totalFp,        // 152 — recipient 154 wins
    challengerName: "Seven Seconds or Less", // boss display name
    sport: "basketball",
    season: "0607",
    senderKind: "boss",
    bossIdentityId: MOCK_BOSS_IDENTITY_ID,
    resolvedSenderHand: {
      handId: SENDER_HAND.handId,
      totalFp: SENDER_HAND.totalFp,
      tier: SENDER_HAND.tier,
      cards: SENDER_HAND.cards as unknown as GeneratedCard[],
    },
  };
}

export default function BossClaimMockRoute() {
  // Force the card every load — the route exists to glass the card. ?claim=force
  // is the DEV override BossClaimPrompt reads; auto-add it so the bare route URL
  // works even for a signed-in (registered) dev user.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("claim") !== "force") {
      sp.set("claim", "force");
      window.history.replaceState({}, "", `${window.location.pathname}?${sp.toString()}`);
    }
  }, []);

  const ctx = buildBossCtx();
  const myScore = RECIPIENT_HAND.totalFp; // 154 ≥ 152 target → inline live-win

  return (
    <H2HRecipientReveal
      challengeCtx={ctx}
      myScore={myScore}
      myRoster={RECIPIENT_HAND.cards as unknown as GeneratedCard[]}
      myWinTier={String(calculateWinTier(myScore) ?? RECIPIENT_HAND.tier)}
      gameState={"REVEALING" as any}
      bypassGameStateGate
      sport="basketball"
      renderBattlefieldCard={h2hArcRenderer}
      renderOverlayCard={h2hOverlayRenderer}
      onSendItBack={() => { /* mock no-op */ }}
      onTryAgain={() => { /* mock no-op */ }}
      onPlayOwnHand={() => { /* mock no-op */ }}
      onDismiss={() => { /* mock no-op */ }}
      roundSignageLabel="3/3"
    />
  );
}

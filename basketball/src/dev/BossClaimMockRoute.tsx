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
import { RECIPIENT_HAND } from "./h2hMockFixture";

const MOCK_BOSS_CHALLENGE_ID = "dev-mock-boss-claim";
// Drives the card's {team} token via split("-")[0] → "PHX". Any authoritative
// {TEAM}-{YYYY} bank key works; PHX-0607 ("Seven Seconds or Less") = today's
// example boss → the card reads "PHX down."
const MOCK_BOSS_IDENTITY_ID = "PHX-0607";

// The REAL boss data shape: the baked revealedFive, RAW — no cardId / wasHeld /
// actualFp / projectedFp (exactly what api/.../sender-hand.ts:62 returns for a
// boss). This is the deterministic repro for the opponent-card misrender: with
// the source fix, H2HRecipientReveal resolves identity onto these and the
// opponent strip renders five distinct cards; without it, all five key to
// undefined and collapse. (h2hMockFixture's SENDER_HAND carries cardId already,
// so it papers the bug — hence the inline raw five here.)
const PHX_0607_REVEALED_FIVE = [
  { basePlayerId: "1890", name: "Shawn Marion", pos: "SF", salary: 54, tier: "PURPLE", fp: 28.3 },
  { basePlayerId: "1952", name: "Raja Bell", pos: "PG", salary: 33, tier: "BLUE", fp: 11.7 },
  { basePlayerId: "959", name: "Steve Nash", pos: "PG", salary: 55, tier: "PURPLE", fp: 35 },
  { basePlayerId: "2405", name: "Amar'e Stoudemire", pos: "PF", salary: 51, tier: "PURPLE", fp: 18.6 },
  { basePlayerId: "2571", name: "Leandro Barbosa", pos: "PG", salary: 41, tier: "BLUE", fp: 15.7 },
];
const PHX_0607_TARGET = 109.3; // = sum of the five fps (the baked target)

/** Boss-flavored ChallengeCtx — recipient (154) beats the boss target (109.3) so
 *  the inline live-win is true; resolvedSenderHand carries the RAW boss five
 *  (no cardId — the real shape) for the battlefield reveal; senderKind:"boss" +
 *  bossIdentityId gate the claim card. */
function buildBossCtx(): ChallengeCtx {
  return {
    challengeId: MOCK_BOSS_CHALLENGE_ID,
    initialRoster: RECIPIENT_HAND.cards as unknown as GeneratedCard[],
    targetScore: PHX_0607_TARGET,            // 109.3 — recipient 154 wins
    challengerName: "Seven Seconds or Less", // boss display name
    sport: "basketball",
    season: "0607",
    senderKind: "boss",
    bossIdentityId: MOCK_BOSS_IDENTITY_ID,
    resolvedSenderHand: {
      handId: MOCK_BOSS_CHALLENGE_ID,
      totalFp: PHX_0607_TARGET,
      tier: null as unknown as string,       // boss sender-hand returns tier:null
      cards: PHX_0607_REVEALED_FIVE as unknown as GeneratedCard[],
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
  const myScore = RECIPIENT_HAND.totalFp; // 154 ≥ 109.3 target → inline live-win

  // DEV glass controls (boss-winscreen-cta, 2026-06-30). Read at render so the
  // harness can hold a deterministic state on the REAL H2HRecipientReveal mount:
  //   ?state=reveal | social | claim  → forwarded as devGlassState (held state).
  //   ?round=2 (etc.)                 → roundSignageLabel "2/3" so the round
  //                                      harness can diff 2/3 ↔ 3/3 chrome.
  // No param ⇒ current behavior (natural play, "3/3"). These drive props only;
  // the surface itself is unchanged.
  const search = typeof window !== "undefined" ? window.location.search : "";
  const sp2 = new URLSearchParams(search);
  const stateParam = sp2.get("state");
  const devGlassState =
    stateParam === "reveal" || stateParam === "social" || stateParam === "claim"
      ? stateParam
      : undefined;
  const roundParam = sp2.get("round");
  const roundSignageLabel = roundParam ? `${roundParam}/3` : "3/3";

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
      roundSignageLabel={roundSignageLabel}
      devGlassState={devGlassState}
    />
  );
}

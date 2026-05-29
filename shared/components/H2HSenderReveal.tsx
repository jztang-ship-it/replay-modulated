// shared/components/H2HSenderReveal.tsx
//
// Phase 5b commit 3 (2026-05-28): production wrapper for the SENDER-side
// H2H result surface. Mounted by GameView when the sender taps a
// `challenge_attempted` notification in the activity panel.
//
// Analog of H2HRecipientReveal — composes H2HResultsOverlay only, no
// arc, per locked decision E from the 2026-05-26 phase-5 design session
// (docs/h2h-reveal-arc-design.md "Sender flow"): the sender already
// played their hand and doesn't need the reveal choreography; they
// need the result.
//
// Mount flow:
//   1. Render nothing while sender-hand fetch is in flight (parity
//      with H2HRecipientReveal's null-then-mount on prefetch resolve).
//   2. On fetch success WITH attempter_roster in payload → mount the
//      full H2HResultsOverlay with both hands.
//   3. On fetch fail / sender_resolved:false / missing attempter_roster
//      → mount SenderLegacyFallbackCard (text-summary card).
//
// Q3 lock (design doc 2026-05-28): top = opponent, bottom = "you"
// universally. Overlay props are named after recipient-side roles;
// sender side passes inverted:
//   sender (overlay top strip)        ← ATTEMPTER's hand + revealOrder
//   recipient (overlay bottom strip)  ← SENDER's own hand + revealOrder
// Rename to topHand/bottomHand is parked for future polish (would ripple
// to H2HRecipientReveal + H2HResultsOverlay.test.tsx).
//
// CTA wiring: sender-side surface uses a single uniform "Play another
// hand" CTA via the overlay's `primaryCtaOverride` prop. State still
// drives headline color/copy (the WIN/LOSS_CLOSED visual treatment is
// derived from is_winner). Phase 8 will replace the placeholder with
// the real social-loop CTA per the parked Q1 lock.

import { useEffect, useMemo, useState } from "react";
import type { GeneratedCard } from "@shared/types";
import type { SenderHand } from "@shared/adapters/challengeTypes";
import {
  H2HResultsOverlay,
  type ResultsOverlayState,
} from "./H2HResultsOverlay";
import {
  type H2HCard,
  type H2HHand,
  type CardRenderer,
} from "./H2HRevealScreen";
import { buildRevealOrder } from "./useH2HReveal";
import { SenderLegacyFallbackCard } from "./SenderLegacyFallbackCard";
import { isRealName } from "@shared/utils/isRealName";
import { getNickname } from "@shared/utils/playerIdentity";

export interface H2HSenderRevealProps {
  /** The full notification — payload shape per api/challenge/[id]/
   *  attempt.ts (post-commit-2): challenge_id, attempter_name,
   *  attempter_user_id, attempter_score, target_score, is_winner,
   *  attempter_roster (null on legacy pre-commit-2 rows). */
  payload: Record<string, any>;
  renderCard: CardRenderer;
  /** Placeholder CTA. GameView decides whether to set challengeBackCtx
   *  based on payload.is_winner (preserves today's win-path exactly
   *  per Strategy A from commit 3 investigation report H). */
  onPlayAnother: () => void;
  onDismiss: () => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "ok"; sender: SenderHand }
  | { status: "fallback" };

export function H2HSenderReveal({ payload, renderCard, onPlayAnother, onDismiss }: H2HSenderRevealProps) {
  const challengeId = typeof payload?.challenge_id === "string" ? payload.challenge_id : null;
  const attempterRoster: GeneratedCard[] | null = Array.isArray(payload?.attempter_roster)
    ? (payload.attempter_roster as GeneratedCard[])
    : null;

  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    if (!challengeId) {
      setFetchState({ status: "fallback" });
      return;
    }
    let cancelled = false;
    fetch(`/api/challenge/${challengeId}/sender-hand`)
      .then(r => r.ok ? r.json() : Promise.reject(`http_${r.status}`))
      .then((d) => {
        if (cancelled) return;
        if (d.sender_resolved === false || !d.sender) {
          setFetchState({ status: "fallback" });
          return;
        }
        setFetchState({ status: "ok", sender: d.sender as SenderHand });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[h2h-sender] sender-hand fetch failed:", err);
        if (!cancelled) setFetchState({ status: "fallback" });
      });
    return () => { cancelled = true; };
  }, [challengeId]);

  if (fetchState.status === "loading") return null;

  if (fetchState.status === "fallback" || !attempterRoster) {
    return (
      <SenderLegacyFallbackCard
        payload={payload}
        onPlayAnother={onPlayAnother}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <H2HSenderRevealInner
      senderResolved={fetchState.sender}
      attempterRoster={attempterRoster}
      payload={payload}
      renderCard={renderCard}
      onPlayAnother={onPlayAnother}
      onDismiss={onDismiss}
    />
  );
}

interface InnerProps {
  senderResolved: SenderHand;
  attempterRoster: GeneratedCard[];
  payload: Record<string, any>;
  renderCard: CardRenderer;
  onPlayAnother: () => void;
  onDismiss: () => void;
}

function H2HSenderRevealInner({
  senderResolved,
  attempterRoster,
  payload,
  renderCard,
  onPlayAnother,
  onDismiss,
}: InnerProps) {
  const attempterRealName = isRealName(payload?.attempter_name) ? String(payload.attempter_name) : null;
  const attempterScore = Number(payload?.attempter_score ?? 0);
  const isAttempterWinner = Boolean(payload?.is_winner);

  // H2HHand objects with INVERTED prop mapping per Q3 lock comment in
  // file header. The `as H2HCard[]` casts are safe per the same contract
  // validation used in H2HRecipientReveal (commit 2): GeneratedCard ≈
  // H2HCard structurally, photoCode drift is runtime-tolerated. tier on
  // the attempter hand is a structural-only field (overlay does not
  // read it) — pass "BUST" as a placeholder.
  const attempterHand: H2HHand = useMemo(() => ({
    handId: `attempter-${payload?.challenge_id ?? ""}`,
    totalFp: attempterScore,
    tier: "BUST",
    cards: attempterRoster as unknown as H2HCard[],
    displayName: attempterRealName ?? "Your opponent",
  }), [attempterScore, attempterRealName, attempterRoster, payload]);

  const senderHand: H2HHand = useMemo(() => ({
    handId: senderResolved.handId,
    totalFp: senderResolved.totalFp,
    tier: senderResolved.tier as H2HHand["tier"],
    cards: senderResolved.cards as unknown as H2HCard[],
    displayName: getNickname() || "You",
  }), [senderResolved]);

  const attempterRevealOrder = useMemo(
    () => buildRevealOrder(attempterHand.cards),
    [attempterHand.cards],
  );
  const senderRevealOrder = useMemo(
    () => buildRevealOrder(senderHand.cards),
    [senderHand.cards],
  );

  // ResultsOverlayState drives the visual treatment. From the sender's
  // POV: attempter winning = sender lost defense (no retry window on
  // sender side, so LOSS_CLOSED). Attempter missing = sender defended =
  // WIN. The LOSS_OPEN state is recipient-only (1-hour replay window).
  const overlayState: ResultsOverlayState = isAttempterWinner ? "LOSS_CLOSED" : "WIN";

  return (
    <H2HResultsOverlay
      sender={attempterHand}
      recipient={senderHand}
      renderCard={renderCard}
      state={overlayState}
      visible={true}
      onDismiss={onDismiss}
      senderRevealOrder={attempterRevealOrder}
      recipientRevealOrder={senderRevealOrder}
      primaryCtaOverride={{ label: "Play another hand", handler: onPlayAnother }}
    />
  );
}

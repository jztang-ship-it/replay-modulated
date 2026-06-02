// shared/components/H2HRecipientReveal.tsx
//
// Phase 5a commit 3 (2026-05-27): production wrapper that composes
// the H2H reveal arc + results overlay for the recipient flow.
//
// Mount gate: returns null unless ALL three conditions hold —
//   1. challengeCtx is present (caller is in challenge mode)
//   2. gameState ∈ {REVEALING, RESULTS} (we're past DEAL)
//   3. challengeCtx.resolvedSenderHand is present (phase-1 endpoint
//      resolved successfully via App.tsx's prefetch)
// When ANY fails, GameView's existing single-player REVEALING +
// ChallengeComparisonScreen path handles the flow. This component
// is purely additive — its mount/unmount is a render-time decision,
// and the existing single-player surface remains intact behind it.
//
// useChallengeAttempt note: this wrapper fires its own POST on mount
// (enabled=true). Each consumer of useChallengeAttempt has its own
// `submittedRef`, so cross-instance dedup is not possible at the hook
// layer. The mutual exclusion that prevents the comparison-sheet from
// firing a duplicate POST is the `!resolvedSenderHand` gate added to
// the comparison-sheet mount in GameView. There's a narrow race
// window if `resolvedSenderHand` flips after the comparison-sheet has
// already mounted (e.g. prefetch resolves mid-flow). Server tolerates
// duplicate attempts via first_attempt_at_ms anchoring (see migration
// 010); duplicate POSTs are observability noise, not correctness bugs.
//
// Per the contract validation in commit 2: GeneratedCard ≈ H2HCard
// structurally, with a single minor drift on photoCode (string | null
// in H2HCard, string | undefined in GeneratedCard). Runtime tolerance
// is high; consumers coalesce. Cast is safe.

import { useEffect, useMemo, useState } from "react";
import type { GeneratedCard } from "@shared/types";
import type { ChallengeCtx, SenderHand } from "@shared/adapters/challengeTypes";
import type { GameState } from "@shared/views/_useSharedGameState";
import { useChallengeAttempt } from "@shared/hooks/useChallengeAttempt";
import {
  H2HRevealScreen,
  usePrefersReducedMotion,
  type CardRenderer,
  type H2HCard,
  type H2HHand,
} from "./H2HRevealScreen";
import { useH2HReveal } from "./useH2HReveal";
import {
  H2HResultsOverlay,
  OVERLAY_CROSSFADE_MS,
  type ResultsOverlayState,
} from "./H2HResultsOverlay";
import { H2HScoreGlide } from "./H2HScoreGlide";
import { isRealName } from "@shared/utils/isRealName";

/** Crossfade-in duration from the HOLD-phase grid into the H2H arc.
 *  ~250ms per the design-doc recipient async MVP spec. Distinct from
 *  OVERLAY_CROSSFADE_MS (350ms; arc → results overlay). */
export const HOLD_TO_ARC_CROSSFADE_MS = 250;

export interface H2HRecipientRevealProps {
  challengeCtx: ChallengeCtx;
  /** Recipient's total FP, computed by the caller from `myRoster`. */
  myScore: number;
  /** Recipient's resolved roster (post-RESOLVE). */
  myRoster: GeneratedCard[];
  /** Recipient's win tier (BUST/ROOKIE/...) — passed to H2HHand.tier
   *  for the recipient column. The overlay's render block doesn't
   *  surface this value today; the prop exists for H2HHand structural
   *  conformance and future use. */
  myWinTier: string;
  gameState: GameState;
  /** Phase 5b piece 2b+2c (2026-05-30): when true, the gameState
   *  REVEALING/RESULTS check is skipped. Used by H2HRecipientPlay's
   *  handoff: the playing-mode surface has no GameView underneath
   *  (App.tsx mounts H2HRecipientPlay directly on challenge accept),
   *  so gameState is meaningless in that path. The senderResolved gate
   *  still applies; mount is gated on senderResolved + bypass flag. */
  bypassGameStateGate?: boolean;
  sport: string;
  /** Sport-specific renderer for the reveal arc (battlefield + strip
   *  cells). Basketball passes a renderer that returns an AthleteCard
   *  with `visibleFp` + `cardShakeType` + reveal state options. */
  renderBattlefieldCard: CardRenderer;
  /** Sport-specific renderer for the overlay (post-reveal, flippable).
   *  Basketball passes a renderer that returns an AthleteCard with
   *  `canFlip=true` + `staticEndState=true`. */
  renderOverlayCard: CardRenderer;
  onSendItBack: () => void;
  onTryAgain: () => void;
  onPlayOwnHand: () => void;
  onDismiss: () => void;
}

export function H2HRecipientReveal(props: H2HRecipientRevealProps) {
  const { challengeCtx, gameState, bypassGameStateGate } = props;
  const senderResolved = challengeCtx.resolvedSenderHand;
  const isInRevealOrResults = gameState === "REVEALING" || gameState === "RESULTS";

  if (!senderResolved || (!isInRevealOrResults && !bypassGameStateGate)) return null;

  // Inner component so the hooks below only fire when the gate passes.
  // (React's rules of hooks require unconditional calls — splitting the
  // gate from the hooks via a sub-component keeps each render path's
  // hook order stable.)
  return <H2HRecipientRevealInner {...props} senderResolved={senderResolved} />;
}

interface InnerProps extends H2HRecipientRevealProps {
  senderResolved: SenderHand;
}

function H2HRecipientRevealInner(props: InnerProps) {
  const {
    challengeCtx, senderResolved, myScore, myRoster, myWinTier, sport,
    renderBattlefieldCard, renderOverlayCard,
    onSendItBack, onTryAgain, onPlayOwnHand, onDismiss,
  } = props;

  const reducedMotion = usePrefersReducedMotion();

  const attempt = useChallengeAttempt({
    challengeId: challengeCtx.challengeId,
    myScore,
    targetScore: challengeCtx.targetScore,
    sport,
    enabled: true,
    resolvedRoster: myRoster,
  });

  // Compose H2HHand objects from the resolved sender data + the
  // recipient's roster/state. The `as H2HCard[]` cast is safe per
  // commit 2's contract validation (photoCode drift is the only
  // difference and it's runtime-tolerated).
  const namedChallenger = isRealName(challengeCtx.challengerName)
    ? challengeCtx.challengerName
    : null;

  const sender: H2HHand = useMemo(() => ({
    handId: senderResolved.handId,
    totalFp: senderResolved.totalFp,
    tier: senderResolved.tier as H2HHand["tier"],
    cards: senderResolved.cards as unknown as H2HCard[],
    displayName: namedChallenger ?? "your friend",
  }), [senderResolved, namedChallenger]);

  // Bug 3: the recipient label in the reveal/results shell now reads
  // the literal "YOU" — matching the Layout A/B restructure's playing-
  // shell label rule (design-lock §1 / §5: "Random handle as your
  // label → literal YOU"). Previously the reveal shell pulled from
  // getNickname() which surfaced the generated nickname (e.g.
  // "DELTAHOOPS_2927") in the recipient's bottom-zone header. The
  // opponent's label (sender.displayName) stays as namedChallenger /
  // "your friend" via the sender memo above.
  const recipient: H2HHand = useMemo(() => ({
    handId: "recipient",
    totalFp: myScore,
    tier: myWinTier as H2HHand["tier"],
    cards: myRoster as unknown as H2HCard[],
    displayName: "YOU",
  }), [myScore, myWinTier, myRoster]);

  // initialPhase: "idle" (phase 5a amend3, 2026-05-27) — the production
  // wrapper mounts with the hook in pre-play state so the HOLD-to-arc
  // crossfade doesn't expose final totals/CTA/headline. The dev mock
  // route inherits the "done" default for its phase-2 static behavior.
  // FIX A (2026-05-30): skipEntrance=true. This wrapper is the ONLY
  // composited-canvas reveal consumer (H2HRecipientPlay mounts it via
  // compositeOverlay; cards are already at strip slots on the
  // still-mounted playing canvas — the deck entrance would re-deal
  // cards that are visibly there). H2HSenderReveal does NOT set this
  // — sender's reveal is a standalone notification view and the deck
  // entrance is correct there. The standalone reveal mock route uses
  // initialPhase:"done" + no skipEntrance — phase-2 static end-state.
  const reveal = useH2HReveal({ sender, recipient, reducedMotion, initialPhase: "idle", skipEntrance: true });

  // Crossfade-in from the underlying GameView surface. setVisible
  // flips on the next animation frame so the CSS opacity transition
  // fires from 0 → 1 instead of mounting visible.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Start the arc once the crossfade has had time to complete.
  // setTimeout matches the crossfade duration so the user sees the
  // entrance animation begin after the fade-in lands.
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => reveal.play(), HOLD_TO_ARC_CROSSFADE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Overlay appears at arc end-hold → done. Independent crossfade
  // (350ms) layered above the arc end-state — same pattern as the dev
  // mock route at H2HRevealMockRoute.tsx:276-278.
  const showOverlay = reveal.phase === "done";
  const overlayCrossfade = useCrossfade(showOverlay, OVERLAY_CROSSFADE_MS);

  // Step-4 glide / C2 — glide-handoff suppression state. Per-team
  // flag that, when true, hides the reveal ScoreCell's INNER GLYPH
  // (visibility:hidden — outer cell box, panel, delta float, momentum
  // tag all stay byte-identical). C4 wires the trigger: when the
  // glide layer fires onGlideStart at t=0 (clones measured + mounted
  // at the source position with identical treatment), the parent
  // flips BOTH flags true in the same React batch as the clones
  // mount, so the source glyphs hide and the clones appear in a
  // single paint — no double-render at lift-off.
  const [glideHandoff, setGlideHandoff] = useState<{ opponent: boolean; user: boolean }>({
    opponent: false,
    user: false,
  });
  // Step-4 glide / C4 — docked-score settled state. Per-team flag
  // that, when true, populates the C1 docked-score slot with its
  // glyph. The glide layer fires onGlideSettle(team) at the end of
  // each team's translate transition; the parent's handler flips
  // that team's flag true. React 18 auto-batches this setState with
  // the glide layer's own internal unmount-this-clone setState so
  // the docked-glyph paint and the clone unmount land in the same
  // frame — no double-render at landing.
  const [dockedScoreSettled, setDockedScoreSettled] = useState<{ opponent: boolean; user: boolean }>({
    opponent: false,
    user: false,
  });
  // When active flips false (e.g. user dismisses overlay and the
  // wrapper re-mounts on a future play), reset both gates so the
  // next reveal→results handoff starts from a clean slate. Active
  // here mirrors the glide's `active` prop: reveal.phase === "done".
  const glideActive = reveal.phase === "done";
  useEffect(() => {
    if (!glideActive) {
      setGlideHandoff({ opponent: false, user: false });
      setDockedScoreSettled({ opponent: false, user: false });
    }
  }, [glideActive]);

  // Step-4 glide / C3 — derived team state for the H2HScoreGlide
  // clones at phase === "done". Same formula H2HResultsOverlay uses
  // for its own ScoreCells (reference total = max of the two finals,
  // tied if within ±0.05). The H2HRevealScreen also resolves to
  // identical values at phase=done (its display-total tick has landed
  // at the final), so clones and source share state/sizeProgress and
  // therefore restScale + color + glow filter — they paint
  // pixel-identically.
  const overlayReferenceTotal = Math.max(myScore, senderResolved.totalFp, 0.0001);
  const senderSizeProgress = senderResolved.totalFp / overlayReferenceTotal;
  const recipientSizeProgress = myScore / overlayReferenceTotal;
  const overlayTied =
    Math.abs(senderResolved.totalFp - myScore) < 0.05 &&
    senderResolved.totalFp > 0 &&
    myScore > 0;
  const senderGlideState: "leading" | "trailing" | "tied" = overlayTied
    ? "tied"
    : senderResolved.totalFp > myScore
      ? "leading"
      : "trailing";
  const recipientGlideState: "leading" | "trailing" | "tied" = overlayTied
    ? "tied"
    : myScore > senderResolved.totalFp
      ? "leading"
      : "trailing";

  return (
    <div
      data-h2h-recipient-reveal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        opacity: visible ? 1 : 0,
        transition: `opacity ${HOLD_TO_ARC_CROSSFADE_MS}ms ease-in`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <H2HRevealScreen
        sender={sender}
        recipient={recipient}
        renderCard={renderBattlefieldCard}
        reveal={reveal}
        glideHandoff={glideHandoff}
      />
      {overlayCrossfade.mounted && (
        <H2HResultsOverlay
          sender={sender}
          recipient={recipient}
          renderCard={renderOverlayCard}
          state={attempt.state satisfies ResultsOverlayState}
          windowClosesAtMs={attempt.windowClosesAtMs}
          visible={overlayCrossfade.visible}
          onSendItBack={onSendItBack}
          onTryAgain={onTryAgain}
          onPlayOwnHand={onPlayOwnHand}
          onDismiss={onDismiss}
          senderRevealOrder={reveal?.senderRevealOrder}
          recipientRevealOrder={reveal?.recipientRevealOrder}
          dockedScoreSettled={dockedScoreSettled}
        />
      )}
      {/* Step-4 glide / C3 — transition-layer scaffolding. Sibling of
          the overlay inside the recipient-reveal wrapper so it is
          OUTSIDE the overlay's opacity subtree (clone glyphs stay
          opacity 1 through the 350 ms overlay crossfade) but INSIDE
          the wrapper's stacking context so its z-index 9050 sits
          BETWEEN the reveal contents (no inner z-index → paints in
          flow) and the overlay (z 9100). C3 mounts the layer,
          measures both endpoints, renders static clones at the start
          position; no motion until C4. With glideHandoff still
          { false, false }, the underlying reveal ScoreCells stay
          visible and the C3 verification can compare clone rect vs
          source rect directly. */}
      <H2HScoreGlide
        active={glideActive}
        sender={{
          total: senderResolved.totalFp,
          state: senderGlideState,
          sizeProgress: senderSizeProgress,
        }}
        recipient={{
          total: myScore,
          state: recipientGlideState,
          sizeProgress: recipientSizeProgress,
        }}
        onGlideStart={() => setGlideHandoff({ opponent: true, user: true })}
        onGlideSettle={(team) => setDockedScoreSettled((prev) => ({ ...prev, [team]: true }))}
      />
    </div>
  );
}

// ── useCrossfade ────────────────────────────────────────────────────
// Local copy of the pattern from H2HRevealMockRoute.tsx:558-573.
// Mounts immediately and flips opacity-visibility on the next frame so
// the CSS opacity transition fires. On hide, holds the mount until
// `duration` ms have passed (to let the transition finish), then
// unmounts.
function useCrossfade(shouldShow: boolean, duration: number) {
  const [mounted, setMounted] = useState(shouldShow);
  const [visible, setVisible] = useState(shouldShow);
  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const id = window.setTimeout(() => setMounted(false), duration);
      return () => clearTimeout(id);
    }
  }, [shouldShow, duration]);
  return { mounted, visible };
}

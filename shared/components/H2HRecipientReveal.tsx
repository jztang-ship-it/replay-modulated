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
import { isRealName } from "@shared/utils/isRealName";
import { BossOutwardEnding } from "./BossOutwardEnding";
import { GlobalChallengeHeader } from "./GlobalChallengeHeader";
import { RoundSignage } from "./H2HBoardShell";
import { explainH2HResult } from "@shared/explanation/explainH2HResult";
import { subscribePoolStats } from "@shared/explanation/poolStatsProvider";
import { fetchAuthoredFlavor } from "@shared/utils/fetchAuthoredFlavor";
import { featureFlags } from "@shared/featureFlags";

// RD7.12 — module-level cache of LLM Flavor lines keyed by request signature.
// Survives overlay remounts; re-opening a result never re-calls (null cached
// too, so a same-session failure/validation-reject doesn't retry — the
// deterministic floor stands). Module scope is fine: the signature includes the
// box line + player + outcome, so collisions only occur for identical facts.
const flavorCache = new Map<string, string | null>();

/** Crossfade-in duration from the HOLD-phase grid into the H2H arc.
 *  ~250ms per the design-doc recipient async MVP spec. Distinct from
 *  OVERLAY_CROSSFADE_MS (350ms; arc → results overlay). */
export const HOLD_TO_ARC_CROSSFADE_MS = 250;

/** Hold at phase "done" before the results-overlay crossfade.
 *  RD7.9.6 (2026-06-15): 1500 → 150. The reveal no longer shows a FINAL
 *  verdict to hold (RD7.9.3 removed finalGapOverride — the delta slot shows
 *  only the per-set delta), so this hold was dead time before the celebration.
 *  Cut to a brief handoff beat so the last-card delta flows straight into the
 *  full-screen reveal. The RD3-C no-snap is unaffected (frame content at "done"
 *  is unchanged; only the hold duration shrinks). Tunable on glass. */
export const FINAL_HOLD_MS = 150;

// TEMP DIAGNOSTIC (reveal-hang triage) — runtime-gated so it fires in the
// PRODUCTION preview build. Opt in with ?arcdebug=1; inert otherwise. REVERT.
const ARC_DEBUG =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("arcdebug") === "1");

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
  /** Round-position signage label (e.g. "3/3"), supplied by H2HRecipientPlay so
   *  the reveal surface shows the final locked round, riding the recipient row.
   *  Optional — omitted by other consumers. */
  roundSignageLabel?: string;
}

export function H2HRecipientReveal(props: H2HRecipientRevealProps) {
  const { challengeCtx, gameState, bypassGameStateGate } = props;
  const senderResolved = challengeCtx.resolvedSenderHand;
  const isInRevealOrResults = gameState === "REVEALING" || gameState === "RESULTS";

  // TEMP DIAGNOSTIC (reveal-hang triage) — the :123 gate render. When
  // senderResolved flips falsy mid-arc, this logs false and the Inner unmounts
  // (see [arc-inner] UNMOUNT) → cancelAll("unmount") → the flicker-unmount hang.
  if (ARC_DEBUG) {
    // eslint-disable-next-line no-console
    console.log("[arc-gate] render", { senderResolved: !!senderResolved, isInRevealOrResults, bypassGameStateGate, willRenderInner: !!senderResolved && (isInRevealOrResults || !!bypassGameStateGate), t: Date.now() });
  }

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
    onSendItBack, onTryAgain, onPlayOwnHand, onDismiss, roundSignageLabel,
  } = props;

  const reducedMotion = usePrefersReducedMotion();

  const attempt = useChallengeAttempt({
    challengeId: challengeCtx.challengeId,
    myScore,
    targetScore: challengeCtx.targetScore,
    sport,
    enabled: true,
    resolvedRoster: myRoster,
    // Layer C, delta-b/c: carry the forwarded ?ref token (if any) onto this
    // attempt. Optional — undefined for direct/human attempts (byte-identical).
    referrerToken: challengeCtx.refToken,
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

  // RD7.2 — the Resolution Engine "why" line for the results overlay.
  // Recomputes when pool stats finish loading (subscribePoolStats), so the
  // percentile-rich explanation replaces the no-stats fallback once the
  // sport's per-season pool file lands. Pure-fn engine; this only gathers.
  const [poolVer, setPoolVer] = useState(0);
  useEffect(() => subscribePoolStats(() => setPoolVer((v) => v + 1)), []);
  const resolution = useMemo(
    () => explainH2HResult({ sender, recipient, sport }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sender, recipient, sport, poolVer],
  );
  const explanation = resolution?.text;          // RD7.11 deterministic floor
  const flavorRequest = resolution?.flavorRequest ?? null;

  // RD7.12 — PRECOMPUTE the LLM-authored Flavor here, at reveal mount, during
  // the ~20s suspense arc BEFORE the result screen. NEVER blocks: the
  // deterministic `explanation` renders immediately; if/when a validated LLM
  // line resolves, it swaps in. Flag OFF or null request (beatdown/tie/
  // non-basketball) → no call, deterministic line stands. Failure/timeout →
  // deterministic line, no error, no gap.
  const [llmFlavor, setLlmFlavor] = useState<string | null>(null);
  useEffect(() => {
    if (!featureFlags.llmFlavor || !flavorRequest) { setLlmFlavor(null); return; }
    const sig = JSON.stringify(flavorRequest);
    if (flavorCache.has(sig)) { setLlmFlavor(flavorCache.get(sig) ?? null); return; }
    let alive = true;
    fetchAuthoredFlavor(flavorRequest).then((line) => {
      flavorCache.set(sig, line);
      if (alive) setLlmFlavor(line);
    });
    return () => { alive = false; };
  }, [flavorRequest]);

  // The line the result screen shows: validated LLM Flavor if ready, else the
  // RD7.11 deterministic floor. Swap-in is just a state update → re-render.
  const displayExplanation = llmFlavor ?? explanation;

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

  // TEMP DIAGNOSTIC (reveal-hang triage) — Inner mount/unmount + tab visibility.
  // An UNMOUNT during the arc is the flicker-unmount trigger (pairs with
  // [arc-gate] senderResolved=false + [arc] cancelAll reason=unmount). A HIDDEN
  // visibility change identifies the tab-background / RAF-pause trigger.
  useEffect(() => {
    if (!ARC_DEBUG) return;
    // eslint-disable-next-line no-console
    console.log("[arc-inner] MOUNT", { t: Date.now() });
    const onVis = () => {
      // eslint-disable-next-line no-console
      console.log("[arc-vis]", document.hidden ? "HIDDEN" : "VISIBLE", { t: Date.now() });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      // eslint-disable-next-line no-console
      console.log("[arc-inner] UNMOUNT", { t: Date.now() });
    };
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
  // RD6.2-C (2026-06-12): hold the FINAL verdict for FINAL_HOLD_MS
  // (1500ms — matches PER_SET_DWELL_MS so the final reads as "one
  // more set hold") before triggering the overlay crossfade. Pre-C
  // the overlay crossfaded immediately at phase=done, which gave the
  // RD6.2-A FINAL state ("Won/Lost X.X FP") barely 100ms of legibility
  // before the overlay covered it. The hold lets the verdict land
  // before results takes over.
  const [doneHoldElapsed, setDoneHoldElapsed] = useState(false);
  useEffect(() => {
    if (reveal.phase === "done") {
      setDoneHoldElapsed(false);
      const id = window.setTimeout(() => setDoneHoldElapsed(true), FINAL_HOLD_MS);
      return () => clearTimeout(id);
    }
    setDoneHoldElapsed(false);
    return undefined;
  }, [reveal.phase]);
  const showOverlay = reveal.phase === "done" && doneHoldElapsed;
  const overlayCrossfade = useCrossfade(showOverlay, OVERLAY_CROSSFADE_MS);

  // RD6.1 (2026-06-11): the step-4 glide infrastructure is retired.
  // Pre-RD6.1 the reveal-side right-rail ScoreCells were hidden via a
  // `suppressed` flag (glideHandoff) the moment the glide animation
  // lifted off, then a clone glyph translated to the overlay's
  // docked-score box and a `dockedScoreSettled` flag flipped to
  // populate the box. Under RD6.1 the totals START in the box corners
  // on both surfaces — no glide is needed. State, the H2HScoreGlide
  // layer, and the per-team-handoff flags are all gone. The
  // reveal→results no-snap is now component+geometric identity:
  // ZoneHeader hosts the same ScoreCell at the same position on both
  // surfaces.

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
        roundSignage={roundSignageLabel ? <RoundSignage label={roundSignageLabel} /> : undefined}
        // RD7.1 (2026-06-13): recipient-flow Reveal screen header. Same
        // component the results overlay below mounts → identical height →
        // reveal→results no-snap preserved.
        globalHeader={<GlobalChallengeHeader />}
      />
      {overlayCrossfade.mounted && (
        <H2HResultsOverlay
          sender={sender}
          recipient={recipient}
          renderCard={renderOverlayCard}
          state={attempt.state satisfies ResultsOverlayState}
          windowClosesAtMs={attempt.windowClosesAtMs}
          visible={overlayCrossfade.visible}
          // RD7.2 — Resolution Engine explanation as the primary why-line.
          // RD7.12 — displayExplanation = validated LLM Flavor if ready, else
          // the RD7.11 deterministic line (never-block swap-in).
          explanation={displayExplanation}
          // RD7.1 (2026-06-13): recipient-flow Results screen header.
          // Identical GlobalChallengeHeader → same height as the reveal
          // shell's header → reveal→results no-snap preserved.
          globalHeader={<GlobalChallengeHeader />}
          onSendItBack={onSendItBack}
          onTryAgain={onTryAgain}
          onPlayOwnHand={onPlayOwnHand}
          onDismiss={onDismiss}
          senderRevealOrder={reveal?.senderRevealOrder}
          recipientRevealOrder={reveal?.recipientRevealOrder}
          // Phase 2-mount Step 3 — boss results terminate OUTWARD. For a boss
          // sender, supply the outward-ending slot; H2HResultsOverlay then
          // renders it IN PLACE OF the human rivalry board. Win is racing the
          // baked target (matches the removed ChallengeComparisonScreen fork);
          // the boss five is the opponent shown in the battlefield reveal
          // above. "Play Again" replays the same boss (onTryAgain) — replay-
          // below-the-line per the outward-ending invariant. recordBossResult
          // + getBossResult inside BossOutwardEnding make fresh === revisited.
          bossOutwardEnding={
            challengeCtx.senderKind === "boss" ? (
              <BossOutwardEnding
                sport={sport}
                bossChallengeId={challengeCtx.challengeId}
                freshResult={{ score: myScore, won: myScore >= challengeCtx.targetScore }}
                marquee={challengeCtx.marquee === true}
                targetScore={challengeCtx.targetScore}
                bossName={challengeCtx.challengerName}
                onPlayAgain={onTryAgain}
              />
            ) : undefined
          }
        />
      )}
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

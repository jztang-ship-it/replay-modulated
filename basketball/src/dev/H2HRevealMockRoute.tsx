/**
 * basketball/src/dev/H2HRevealMockRoute.tsx
 *
 * Dev-only mount for the H2H reveal arc + results overlay loop.
 *
 * Phase 2/3: H2HRevealScreen driven by useH2HReveal hook + mock fixture.
 * Phase 4: when the hook lands in `done`, this route renders
 *   H2HResultsOverlay above the screen. Dev controls toggle
 *   WIN / LOSS_OPEN / LOSS_CLOSED + margin bucket (photo_finish /
 *   narrow / blowout) so the overlay variants can be iterated without
 *   touching live data. Phase 4 mock-only — CTAs no-op to console.
 *
 * Mounted at pathname /basketball/dev/h2h-reveal-mock via regex match
 * in basketball/src/App.tsx. Production users have no entry point to
 * /dev/* paths.
 *
 * Phase 5 will replace the fixture import with a fetch against
 * /api/challenge/{id}/sender-hand; the same renderCard wiring + same
 * H2HRevealScreen + hook carry forward.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  H2HRevealScreen,
  usePrefersReducedMotion,
  type H2HCard,
  type CardRenderer,
  type H2HHand,
} from "@shared/components/H2HRevealScreen";
import {
  useH2HReveal,
  MATCHUP_DURATION_MS,
} from "@shared/components/useH2HReveal";
import {
  H2HResultsOverlay,
  OVERLAY_CROSSFADE_MS,
  type ResultsOverlayState,
} from "@shared/components/H2HResultsOverlay";
import { H2HScoreGlide } from "@shared/components/H2HScoreGlide";
import { AthleteCard } from "../components/AthleteCard";
import { SENDER_HAND, RECIPIENT_HAND } from "./h2hMockFixture";
import type { PlayerCard } from "../adapters/types";
import { getShakeType } from "@shared/hooks/useEmotionalReveal";

// Amend6 bug B fix (2026-05-27): derive `cardShakeType` from the
// card's actualFp/projectedFp ratio so PlayerCardShell triggers the
// SMOKING HOT / ON FIRE / ICE COLD / FREEZING stamp + the CardFront
// fire/ice visual effects. Single-player wires this through
// useEmotionalReveal's cardShakeTypeMap; H2H computes it directly
// from the card data because each card's actualFp is already known
// at fixture load. `isAnchor=false` since H2H doesn't have the same
// "final card forced to big" notion the single-player anchor uses.
const shakeForCard = (card: H2HCard) =>
  getShakeType(card as unknown as { projectedFp: number; actualFp: number; cardId: string }, false);

// AthleteCard wrapper used during the reveal ARC. Static end-state and
// animated reveal both flow through this single renderer; the
// difference is whether `visibleFp` is set. canFlip=false during the
// arc — flip is an overlay-only affordance.
const renderBattlefieldCard: CardRenderer = (card: H2HCard, options) => {
  // Post-amend6 pre-reveal rule (2026-05-27): a card is in the pre-reveal
  // band until its rollup completes (visibleFp >= actualFp). Pre-reveal
  // cards show the State B visual (greyed projected FP, no badges, no
  // stamp); post-reveal cards show the full post-reveal content. The
  // mid-rollup hero card is "not yet revealed" — `isRevealed` flips true
  // at the rollup-terminal write inside useH2HReveal.
  const isRevealed = options?.revealed ?? false;
  return (
    <AthleteCard
      card={card as unknown as PlayerCard}
      phase={"RESULTS" as any}
      isFlipped={false}
      canFlip={false}
      locked={card.wasHeld}
      heldFpVisible={true}
      // Badge / shake gating mirrors single-player's visibleBadgesMap +
      // post-rollup stamp pattern (useEmotionalReveal.ts:503-505 +
      // PlayerCardShell stamp-effect). Pre-reveal: empty badges, null
      // shake → no stamp fires. Post-reveal: real badges + computed shake.
      badges={isRevealed ? card.achievements : []}
      visibleFp={options?.visibleFp}
      fpCountUpMs={MATCHUP_DURATION_MS}
      cardShakeType={isRevealed ? shakeForCard(card) : null}
      // Drive State B (front-face pre-reveal) for not-yet-revealed cards.
      // CardFront's gate requires isRevealing=true AND visibleFp=undefined.
      // For the mid-rollup hero, visibleFp is defined → isPreReveal=false →
      // post-reveal visual still resolves correctly.
      isRevealing={!isRevealed}
      // H2H treats every card as a first-time reveal regardless of wasHeld.
      // Held cards (4 of 12 in the mock) would otherwise be excluded from
      // the pre-reveal gate by CardFront's `!isHeldCard` clause.
      ignoreHeldStatus={true}
      // Stamp-on-mount only when a card is already revealed AND has no
      // active rollup (strip cell after its matchup completed). The
      // actively-rolling card hits PlayerCardShell's rollupComplete path
      // via the per-tick visibleFp advance from useH2HReveal.
      staticEndState={isRevealed && options?.visibleFp === undefined}
      // Shake + blast props — only passed by the BattlefieldCard renderer
      // call site (strip cells + deck cells leave these undefined →
      // shakeType=null, glowActive=false → no shake, no blast).
      shakeType={options?.shakeType ?? null}
      glowActive={options?.glowActive ?? false}
      glowTier={options?.glowTier ?? "WHITE"}
      glowDurationMs={options?.glowDurationMs ?? 700}
    />
  );
};

// Read URL query params once at module load. Powers dev smoke capture
// — headless Chrome can't easily click buttons, but it can load a URL
// with the desired state baked in.
//
// Supported params:
//   ?autoplay=1        — start the reveal arc immediately on mount.
//   ?overlay=1         — bypass the arc, mount with the overlay shown.
//   ?variant=…         — WIN | LOSS_OPEN | LOSS_CLOSED. Default WIN.
//   ?margin=…          — photo_finish | narrow | blowout. Default narrow.
//   ?topFlipped=cardId    — seed the TOP strip's selection (sender card).
//   ?bottomFlipped=cardId — seed the BOTTOM strip's selection (recipient card).
interface DevUrlParams {
  autoplay: boolean;
  overlay: boolean;
  variant: OverlayVariantKey;
  margin: MarginBucketKey;
  topFlippedId: string | null;
  bottomFlippedId: string | null;
}
function readDevParams(): DevUrlParams {
  const defaults: DevUrlParams = {
    autoplay: false,
    overlay: false,
    variant: "WIN",
    margin: "narrow",
    topFlippedId: null,
    bottomFlippedId: null,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const sp = new URLSearchParams(window.location.search);
    const variant = sp.get("variant");
    const margin = sp.get("margin");
    const topFlipped = sp.get("topFlipped");
    const bottomFlipped = sp.get("bottomFlipped");
    return {
      autoplay: sp.get("autoplay") === "1",
      overlay: sp.get("overlay") === "1",
      variant: (variant === "LOSS_OPEN" || variant === "LOSS_CLOSED" || variant === "WIN")
        ? variant
        : defaults.variant,
      margin: (margin === "photo_finish" || margin === "narrow" || margin === "blowout")
        ? margin
        : defaults.margin,
      topFlippedId: topFlipped && topFlipped.trim() !== "" ? topFlipped.trim() : null,
      bottomFlippedId: bottomFlipped && bottomFlipped.trim() !== "" ? bottomFlipped.trim() : null,
    };
  } catch {
    return defaults;
  }
}

// ── Phase 4 result-variant simulation ─────────────────────────────────────
// The overlay's state machine + margin bucket drive headline copy + CTA
// availability + countdown visibility. The dev controls let the user
// pick a variant + margin and synthesize the corresponding (sender,
// recipient) hands by mutating only `totalFp` — leaving the card-level
// `actualFp` data alone. The reveal arc still plays the existing
// 178.4 vs 182.4 mock (a `win_narrow` scenario); the overlay reads its
// state independently from the dev controls. This is acceptable
// inconsistency for phase 4 — phase 5 derives variant + margin from
// actual data, so the mismatch evaporates.

type OverlayVariantKey = "WIN" | "LOSS_OPEN" | "LOSS_CLOSED";
type MarginBucketKey = "photo_finish" | "narrow" | "blowout";

interface SyntheticHands {
  sender: H2HHand;
  recipient: H2HHand;
}

/** Synthesize sender + recipient totals for the chosen variant.
 *  Card identities + per-card actualFp stay verbatim from the mock —
 *  only `totalFp` shifts. Phase 5 stops calling this and uses the real
 *  resolved hands' totals directly. */
function synthesizeHands(
  state: OverlayVariantKey,
  margin: MarginBucketKey,
): SyntheticHands {
  // Pick a magnitude per margin bucket. Photo finish lands at ~1 FP,
  // narrow at ~4-5 FP, blowout at ~20+ FP.
  const magnitude =
    margin === "photo_finish" ? 0.8
    : margin === "narrow" ? 4.5
    : 22.0;
  // Sign by state: WIN means recipient > sender (positive signed delta).
  const sign = state === "WIN" ? 1 : -1;
  const signedDelta = magnitude * sign;
  // Anchor sender at the existing mock total; shift recipient by the
  // signed delta so the overlay's `recipient.totalFp - sender.totalFp`
  // resolves to the chosen variant + margin combination.
  const senderTotal = SENDER_HAND.totalFp;
  const recipientTotal = Math.round((senderTotal + signedDelta) * 10) / 10;
  return {
    sender: { ...SENDER_HAND, totalFp: senderTotal },
    recipient: { ...RECIPIENT_HAND, totalFp: recipientTotal },
  };
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export function H2HRevealMockRoute() {
  const reducedMotion = usePrefersReducedMotion();
  const initialParams = useMemo(readDevParams, []);

  // ── Overlay variant + margin toggles (dev-only) ────────────────────────
  const [overlayVariant, setOverlayVariant] = useState<OverlayVariantKey>(initialParams.variant);
  const [overlayMargin, setOverlayMargin] = useState<MarginBucketKey>(initialParams.margin);
  const synthetic = useMemo(
    () => synthesizeHands(overlayVariant, overlayMargin),
    [overlayVariant, overlayMargin],
  );

  // ── Manual "Skip to overlay" override ──────────────────────────────────
  // When the user wants to iterate the overlay without watching the
  // ~22s arc, they tap "Skip to overlay" which sets this true and
  // bypasses the reveal arc end-state gate. Replay clears it.
  // ?overlay=1 URL param seeds this true so smoke captures land
  // directly on the overlay.
  const [forceOverlay, setForceOverlay] = useState(initialParams.overlay);

  // ── Dismissed flag ─────────────────────────────────────────────────────
  // When the user taps × or Dismiss on the overlay, this flips true and
  // the overlay's `visible` prop drops to false (crossfade out). After
  // the crossfade completes, we unmount the overlay so the underlying
  // arc end-state is fully visible again. Replay clears it.
  const [dismissed, setDismissed] = useState(false);

  // ── Initial-flipped seeds for smoke captures ───────────────────────────
  // ?topFlipped=cardId / ?bottomFlipped=cardId URL params seed each
  // strip's initial flip state on FIRST mount. Phase 4 fix 3 has per-
  // strip flip — both slots can be filled simultaneously. Re-mount on
  // Replay/Skip-to-overlay bumps `overlayMountKey` so the seeds are
  // dropped (next visit starts with both hero slots empty).
  const initialTopFlippedCardId = initialParams.topFlippedId;
  const initialBottomFlippedCardId = initialParams.bottomFlippedId;

  // Reveal hook drives the arc. The OVERLAY's data (synthetic hands) is
  // independent of the hook's hands — the hook always plays the
  // existing mock arc (178.4 vs 182.4) so the reveal choreography is
  // stable regardless of which variant the user is iterating.
  const reveal = useH2HReveal({
    sender: SENDER_HAND,
    recipient: RECIPIENT_HAND,
    reducedMotion,
    onMatchupResolved: (index, _matchup, state) => {
      // eslint-disable-next-line no-console
      console.info("[h2h-mock] matchup resolved", index, state);
    },
    onArcResolved: (state) => {
      // eslint-disable-next-line no-console
      console.info("[h2h-mock] arc resolved", state);
    },
  });

  useEffect(() => {
    if (initialParams.autoplay) reveal.play();
    if (initialParams.overlay) reveal.skipToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Overlay visibility ──────────────────────────────────────────────────
  // The overlay shows when:
  //   (a) the arc has fully resolved (phase === "done"), OR
  //   (b) the user pressed "Skip to overlay" (forceOverlay=true).
  // AND has not been dismissed. Phase 4 ships a crossfade (350ms)
  // between arc end-state and overlay landing — phase 6 replaces with
  // the real win/loss climax animation.
  const shouldShowOverlay = (forceOverlay || reveal.phase === "done") && !dismissed;
  const { mounted: overlayMounted, visible: overlayVisible } =
    useCrossfade(shouldShowOverlay, OVERLAY_CROSSFADE_MS);

  // ── Window timer for LOSS_OPEN ──────────────────────────────────────────
  // Mock the server's `window_closes_at_ms`: 60 minutes from the moment
  // the overlay would first appear. Phase 5 reads from the real
  // `/attempt` response. Locked at first show so the timer doesn't
  // reset when the user toggles variants.
  const [windowOpenedAtMs] = useState(() => Date.now());
  const windowClosesAtMs = windowOpenedAtMs + ONE_HOUR_MS;

  // ── Renderer for the OVERLAY cards ──────────────────────────────────────
  // Distinct from `renderBattlefieldCard` — the overlay's renderer
  // reads `options.flipped` (passed by the overlay's LineupStrip,
  // which now owns the flip state). canFlip=true so PlayerCardShell
  // renders the back face when flipped=true; no onToggleFlip — the
  // cell wrapper inside the overlay owns the click. The card-back
  // (BackBStats) renders from the existing gameInfo + statLine fields
  // in the mock fixture — no fixture extensions needed.
  const renderOverlayCard: CardRenderer = useCallback((card: H2HCard, options) => (
    <AthleteCard
      card={card as unknown as PlayerCard}
      phase={"RESULTS" as any}
      isFlipped={options?.flipped ?? false}
      canFlip={true}
      locked={card.wasHeld}
      heldFpVisible={true}
      badges={card.achievements}
      cardShakeType={shakeForCard(card)}
      // Overlay never animates a rollup — every card is resolved end-state.
      staticEndState={true}
      // Same held-card override as the arc renderer — overlay also shows
      // all 12 cards as first-time reveals (the held flag is sort-order
      // data, not a carry-over signal in H2H).
      ignoreHeldStatus={true}
    />
  ), []);

  // ── CTA handlers (phase 4 console.info — phase 5 wires for real) ───────
  const noop = useCallback((label: string) => () => {
    // eslint-disable-next-line no-console
    console.info(`[h2h-mock] CTA "${label}" pressed (phase 4 no-op)`);
  }, []);
  const onSendItBack = useMemo(() => noop("Send It Back"), [noop]);
  const onTryAgain = useMemo(() => noop("Try Again"), [noop]);
  const onPlayOwnHand = useMemo(() => noop("Play your own hand"), [noop]);
  const onDismiss = useCallback(() => {
    // eslint-disable-next-line no-console
    console.info('[h2h-mock] CTA "Dismiss" pressed — fading overlay back to arc end-state');
    setDismissed(true);
  }, []);

  // Bumped on each Replay so the overlay re-mounts cleanly (resets its
  // internal flip state); also seeds initial flipped ids from the
  // ?flipped= URL param on the FIRST mount via the `key` prop below.
  const [overlayMountKey, setOverlayMountKey] = useState(0);

  // Step-4 glide / C4 — mirror H2HRecipientReveal's wiring exactly so
  // the dev mock drives the same handoff sequence the production
  // wrapper does. glideHandoff suppresses the reveal source glyphs at
  // t=0; dockedScoreSettled populates the docked targets at landing.
  // Both default to both-false and reset when the glide goes inactive.
  const [mockGlideHandoff, setMockGlideHandoff] = useState<{ opponent: boolean; user: boolean }>({
    opponent: false,
    user: false,
  });
  const [mockDockedScoreSettled, setMockDockedScoreSettled] = useState<{ opponent: boolean; user: boolean }>({
    opponent: false,
    user: false,
  });
  const mockGlideActive = reveal.phase === "done";
  useEffect(() => {
    if (!mockGlideActive) {
      setMockGlideHandoff({ opponent: false, user: false });
      setMockDockedScoreSettled({ opponent: false, user: false });
    }
  }, [mockGlideActive]);

  // ── Replay handlers ────────────────────────────────────────────────────
  const handleReplay = useCallback(() => {
    setForceOverlay(false);
    setDismissed(false);
    setOverlayMountKey(k => k + 1);
    // Reset glide gates explicitly. Replay drops the phase out of
    // "done" so the active-driven reset above also fires, but
    // belt-and-suspenders here keeps the next handoff clean.
    setMockGlideHandoff({ opponent: false, user: false });
    setMockDockedScoreSettled({ opponent: false, user: false });
    reveal.play();
  }, [reveal]);

  const handleSkipToOverlay = useCallback(() => {
    setForceOverlay(true);
    setDismissed(false);
    setOverlayMountKey(k => k + 1);
    // Also jump the hook to its end state so any subsequent Replay
    // starts from a clean slate.
    reveal.skipToEnd();
  }, [reveal]);

  return (
    <>
      <H2HRevealScreen
        sender={SENDER_HAND}
        recipient={RECIPIENT_HAND}
        renderCard={renderBattlefieldCard}
        reveal={reveal}
        glideHandoff={mockGlideHandoff}
      />
      {overlayMounted && (
        <H2HResultsOverlay
          key={overlayMountKey}
          sender={synthetic.sender}
          recipient={synthetic.recipient}
          renderCard={renderOverlayCard}
          state={overlayVariant satisfies ResultsOverlayState}
          windowClosesAtMs={
            overlayVariant === "LOSS_OPEN" ? windowClosesAtMs : null
          }
          visible={overlayVisible}
          initialTopFlippedCardId={overlayMountKey === 0 ? initialTopFlippedCardId : null}
          initialBottomFlippedCardId={overlayMountKey === 0 ? initialBottomFlippedCardId : null}
          onSendItBack={onSendItBack}
          onTryAgain={onTryAgain}
          onPlayOwnHand={onPlayOwnHand}
          onDismiss={onDismiss}
          dockedScoreSettled={mockDockedScoreSettled}
          glideHandoff={mockGlideHandoff}
        />
      )}
      {/* Step-4 glide / C4 — mirror the production wrapper's
          H2HRecipientReveal mount + wiring exactly: glideHandoff +
          dockedScoreSettled state, with onGlideStart / onGlideSettle
          callbacks flipping each. The harness verifies the C4 motion
          + settle + unmount through this dev route at the same
          ?overlay=1 surface it uses for the other no-jump assertions. */}
      {(() => {
        const ref = Math.max(synthetic.sender.totalFp, synthetic.recipient.totalFp, 0.0001);
        const tied =
          Math.abs(synthetic.sender.totalFp - synthetic.recipient.totalFp) < 0.05 &&
          synthetic.sender.totalFp > 0 && synthetic.recipient.totalFp > 0;
        const senderState: "leading" | "trailing" | "tied" = tied
          ? "tied"
          : synthetic.sender.totalFp > synthetic.recipient.totalFp ? "leading" : "trailing";
        const recipientState: "leading" | "trailing" | "tied" = tied
          ? "tied"
          : synthetic.recipient.totalFp > synthetic.sender.totalFp ? "leading" : "trailing";
        return (
          <H2HScoreGlide
            active={reveal.phase === "done"}
            sender={{
              total: synthetic.sender.totalFp,
              state: senderState,
              sizeProgress: synthetic.sender.totalFp / ref,
            }}
            recipient={{
              total: synthetic.recipient.totalFp,
              state: recipientState,
              sizeProgress: synthetic.recipient.totalFp / ref,
            }}
            onGlideStart={() => setMockGlideHandoff({ opponent: true, user: true })}
            onGlideSettle={(team) =>
              setMockDockedScoreSettled((prev) => ({ ...prev, [team]: true }))
            }
          />
        );
      })()}
      <DevControls
        phase={reveal.phase}
        matchupIndex={reveal.matchupIndex}
        matchupCount={reveal.matchupCount}
        entranceSettledCount={reveal.entranceSettledCount}
        pulseActive={reveal.pulseActive}
        showOverlay={shouldShowOverlay}
        overlayVariant={overlayVariant}
        overlayMargin={overlayMargin}
        onPlay={handleReplay}
        onSkip={reveal.skipToEnd}
        onSkipToOverlay={handleSkipToOverlay}
        onSetVariant={setOverlayVariant}
        onSetMargin={setOverlayMargin}
      />
    </>
  );
}

// ── Dev-only control overlay ──────────────────────────────────────────────
// Bottom-right fixed cluster. Buttons are intentionally small + low-
// contrast so they don't dominate the visual smoke screenshots; the
// reveal surface is the artifact being evaluated.

interface DevControlsProps {
  phase: string;
  matchupIndex: number;
  matchupCount: number;
  entranceSettledCount: number;
  pulseActive: boolean;
  showOverlay: boolean;
  overlayVariant: OverlayVariantKey;
  overlayMargin: MarginBucketKey;
  onPlay: () => void;
  onSkip: () => void;
  onSkipToOverlay: () => void;
  onSetVariant: (v: OverlayVariantKey) => void;
  onSetMargin: (m: MarginBucketKey) => void;
}

function DevControls({
  phase, matchupIndex, matchupCount, entranceSettledCount, pulseActive,
  showOverlay, overlayVariant, overlayMargin,
  onPlay, onSkip, onSkipToOverlay, onSetVariant, onSetMargin,
}: DevControlsProps) {
  const isAnimating = phase === "entering" || phase === "anticipating" || phase === "revealing" || phase === "paused" || phase === "end-hold";
  const playLabel = phase === "done" || showOverlay ? "Replay" : "Play";
  // Replay button is hidden during end-hold so the user can absorb the
  // climax without next-step UI appearing. Skip is also hidden in the
  // hold (skipping a settle period isn't meaningful).
  const showPlay = phase !== "end-hold";
  const showSkipArc = phase !== "end-hold" && !showOverlay;
  // Phase-specific progress string.
  const progress = showOverlay
    ? `overlay ${overlayVariant.toLowerCase()}`
    : phase === "entering"
      ? `${entranceSettledCount}/${matchupCount} dealt`
      : phase === "anticipating"
        ? (pulseActive ? "pulse" : "still")
        : `${matchupIndex + 1}/${matchupCount}`;
  return (
    <div
      data-h2h-dev-controls="true"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        right: 12,
        zIndex: 9200,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "stretch",
        padding: "8px 10px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.65)",
        border: "1px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
        color: "rgba(255,255,255,0.85)",
        maxWidth: 320,
      }}
    >
      {/* Row 1: phase/progress + Play/Replay + Skip(arc) + Skip-to-overlay */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          data-h2h-dev-phase={phase}
          style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7, flex: 1 }}
        >
          {phase} · {progress}
        </span>
        {showPlay && (
          <button
            type="button"
            data-h2h-dev-play="true"
            onClick={onPlay}
            style={controlButtonStyle}
          >
            {playLabel}
          </button>
        )}
        {showSkipArc && (
          <button
            type="button"
            data-h2h-dev-skip="true"
            onClick={onSkip}
            disabled={!isAnimating}
            style={{ ...controlButtonStyle, opacity: isAnimating ? 1 : 0.4 }}
          >
            Skip
          </button>
        )}
        {!showOverlay && (
          <button
            type="button"
            data-h2h-dev-skip-to-overlay="true"
            onClick={onSkipToOverlay}
            style={controlButtonStyle}
          >
            →&nbsp;Overlay
          </button>
        )}
      </div>

      {/* Row 2: variant toggle. Only shown when overlay is up so the
          controls don't clutter the arc surface. */}
      {showOverlay && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ opacity: 0.55, width: 50 }}>Variant</span>
          {(["WIN", "LOSS_OPEN", "LOSS_CLOSED"] as const).map(v => (
            <button
              key={v}
              type="button"
              data-h2h-dev-variant={v}
              onClick={() => onSetVariant(v)}
              style={{
                ...controlButtonStyle,
                background: overlayVariant === v ? "rgba(255,177,74,0.25)" : "rgba(255,255,255,0.08)",
                borderColor: overlayVariant === v ? "rgba(255,177,74,0.6)" : "rgba(255,255,255,0.25)",
              }}
            >
              {v === "WIN" ? "win" : v === "LOSS_OPEN" ? "loss·open" : "loss·closed"}
            </button>
          ))}
        </div>
      )}

      {/* Row 3: margin toggle. */}
      {showOverlay && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ opacity: 0.55, width: 50 }}>Margin</span>
          {(["photo_finish", "narrow", "blowout"] as const).map(m => (
            <button
              key={m}
              type="button"
              data-h2h-dev-margin={m}
              onClick={() => onSetMargin(m)}
              style={{
                ...controlButtonStyle,
                background: overlayMargin === m ? "rgba(255,177,74,0.25)" : "rgba(255,255,255,0.08)",
                borderColor: overlayMargin === m ? "rgba(255,177,74,0.6)" : "rgba(255,255,255,0.25)",
              }}
            >
              {m === "photo_finish" ? "photo" : m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Crossfade hook ────────────────────────────────────────────────────────
// Generic show/hide-with-crossfade primitive. Returns `mounted` (DOM
// presence) + `visible` (opacity target). When `shouldShow` flips
// true: mount immediately, then visible=true on the next animation
// frame so the CSS opacity transition fires from 0 to 1. When it
// flips false: visible=false (transition runs), then unmount after
// `duration` ms.
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

const controlButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.95)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

export default H2HRevealMockRoute;

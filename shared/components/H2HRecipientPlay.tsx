// shared/components/H2HRecipientPlay.tsx
//
// Phase 5b piece 2b+2c (2026-05-30): recipient-play surface.
//
// Lock reference: docs/h2h-reveal-arc-design.md
//   "### Phase 5b piece 2b+2c — recipient-play on H2H surface + drawing
//    mechanic (locked 2026-05-28)" — P1-P10 + implementation-clarification
//    note (P4-α).
//
// Routing: mounted at the basketball App level on challenge-link accept
// instead of GameView. Owns the playing-mode lifecycle (drawnCount 0→6,
// 800ms hold, resolveRoster) and then mounts the inner H2HRecipientReveal
// (arc + overlay) with bypassGameStateGate=true since there is no
// GameView underneath this surface.
//
// P4-α (pace-the-deal facade): the recipient's roster is
// challengeCtx.initialRoster (the sender's initial deal, used as the
// recipient's hand per the existing GameView challenge-mode path at
// shared/views/GameView.tsx:1671-1673). Each Draw tap reveals the next
// card from this cached array into the bottom strip — no per-card
// engine call. The engine resolution (resolveRoster, for actualFp
// freshness) runs ONCE at slot-6 handoff time. P7 (hold/redraw) is
// deferred to piece 2d; this surface gives the recipient no strategic
// choices for now.

import { useEffect, useRef, useState } from "react";
import type { GeneratedCard } from "@shared/types";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { H2HRecipientReveal } from "./H2HRecipientReveal";
import type { CardRenderer } from "./H2HRevealScreen";
import { setActiveSeason } from "@shared/engines/dataEngine";
import { isRealName } from "@shared/utils/isRealName";

const ROSTER_SIZE = 6;

/** Pause after slot 6 fills before transitioning to arc-reveal. Per
 *  P9 in the 2b+2c lock — gives the recipient a moment to register
 *  their full roster before the reveal kicks off. */
export const PRE_REVEAL_HOLD_MS = 800;

// Per piece 2a geometry (smoke artifact 2026-05-28): top strip
// marginBottom 18 / hero marginBottom 4 / bottom strip marginBottom 0 /
// reserved paddingTop 8. Same values as H2HResultsOverlay +
// H2HRevealScreen so the playing-mode surface visually anchors at the
// same Y positions for the top strip, hero zone, bottom strip, and CTA.
const TOP_STRIP_MARGIN_BOTTOM_PX = 18;
const HERO_ZONE_MARGIN_BOTTOM_PX = 4;
const BOTTOM_STRIP_MARGIN_BOTTOM_PX = 0;
const RESERVED_PADDING_TOP_PX = 8;
const RESERVED_MIN_HEIGHT_PX = 77;

// Mini-cell dimensions — matches HAND_STRIP_HEIGHT_PX (80) and the
// derived STRIP_CARD_DISPLAY_WIDTH_PX ((80 * 329) / 478 ≈ 55) used by
// H2HRevealScreen's HandStrip. Same Y/X footprint so the eye doesn't
// reflow when the surface hands off to the arc.
const MINI_CELL_WIDTH_PX = 55;
const MINI_CELL_HEIGHT_PX = 80;
const STRIP_GAP_PX = 4;

const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

export interface H2HRecipientPlayProps {
  challengeCtx: ChallengeCtx;
  sport: string;
  /** Sport-specific roster resolver. Called once at handoff time on the
   *  recipient's drawn roster to ensure actualFp is populated (the
   *  serialized initialRoster may have stale or 0 actualFp). Returns the
   *  resolved GeneratedCard[] in either `roster` or `cards`. */
  resolveRoster: (args: { finalCards: GeneratedCard[] }) => Promise<{
    roster?: GeneratedCard[];
    cards?: GeneratedCard[];
    mvpCardId?: string;
  }>;
  /** Sport-specific win-tier calculator. */
  calculateWinTier: (totalFp: number) => string;
  /** Sport-specific renderers — passed through to the inner
   *  H2HRecipientReveal at handoff. Playing-mode itself uses inline
   *  stylized mini-cards for the bottom strip (visual polish deferred
   *  to piece 2e). */
  renderBattlefieldCard: CardRenderer;
  renderOverlayCard: CardRenderer;
  /** Reveal-overlay CTA handlers — forwarded to inner H2HRecipientReveal. */
  onSendItBack: () => void;
  onTryAgain: () => void;
  onPlayOwnHand: () => void;
  onDismiss: () => void;
}

export function H2HRecipientPlay(props: H2HRecipientPlayProps) {
  const {
    challengeCtx, sport, resolveRoster, calculateWinTier,
    renderBattlefieldCard, renderOverlayCard,
    onSendItBack, onTryAgain, onPlayOwnHand, onDismiss,
  } = props;

  // Pin the data engine to the challenge's season on mount —
  // DailySeasonReelGate normally does this for GameView, but the
  // playing-mode surface bypasses the gate. normalizeSeasonKey in
  // dataEngine.ts:66 absorbs label-form input (handles the legacy
  // "2024-25" vs "2425" mismatch fixed in 36684c9).
  useEffect(() => {
    setActiveSeason(challengeCtx.season);
  }, [challengeCtx.season]);

  const initialRoster = challengeCtx.initialRoster;

  // drawnCount: 0 → ROSTER_SIZE. Each Draw tap reveals the next card.
  const [drawnCount, setDrawnCount] = useState(0);

  // Handoff lifecycle: once slot 6 fills, set handoffStarted (which
  // disables the Draw button + changes the headline), wait
  // PRE_REVEAL_HOLD_MS, then run resolveRoster + transition.
  const [handoffStarted, setHandoffStarted] = useState(false);
  const [resolvedRoster, setResolvedRoster] = useState<GeneratedCard[] | null>(null);
  const [resolvedScore, setResolvedScore] = useState<number>(0);
  const [resolvedTier, setResolvedTier] = useState<string>("BUST");

  // Stable refs so the slot-6 effect doesn't depend on prop-callback
  // identity churn (prevents re-running the resolve on every parent
  // render).
  const resolveRosterRef = useRef(resolveRoster);
  const calculateWinTierRef = useRef(calculateWinTier);
  useEffect(() => { resolveRosterRef.current = resolveRoster; }, [resolveRoster]);
  useEffect(() => { calculateWinTierRef.current = calculateWinTier; }, [calculateWinTier]);

  // Handoff guard — fires the slot-6 → 800ms-hold → resolveRoster path
  // exactly once. Tracked via ref (not state) so subsequent re-renders
  // (handoffStarted flip, resolvedRoster set, etc.) DO NOT re-run this
  // effect and DO NOT trigger its cleanup, which would clear the
  // pending timer. State-dep-based gating would cancel its own timer.
  const handoffScheduledRef = useRef(false);

  useEffect(() => {
    if (drawnCount < ROSTER_SIZE || handoffScheduledRef.current) return;
    handoffScheduledRef.current = true;
    setHandoffStarted(true);
    const timer = window.setTimeout(async () => {
      let resolved: GeneratedCard[] = initialRoster;
      try {
        const res = await resolveRosterRef.current({ finalCards: initialRoster });
        resolved = (res?.roster ?? res?.cards ?? initialRoster) as GeneratedCard[];
      } catch (err) {
        // Non-fatal: fall through to initialRoster, which may have
        // stale or zero actualFp — arc still mounts; the recipient
        // sees their roster with whatever actualFp survived
        // serialization. Surfaced for observability.
        // eslint-disable-next-line no-console
        console.warn("[h2h-play] resolveRoster failed; using initialRoster as-is:", err);
      }
      const score = resolved.reduce((s, c: any) => s + Number(c.actualFp ?? 0), 0);
      const tier = calculateWinTierRef.current(score) ?? "BUST";
      setResolvedRoster(resolved);
      setResolvedScore(score);
      setResolvedTier(tier);
    }, PRE_REVEAL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [drawnCount, initialRoster]);

  const handleDraw = () => {
    if (drawnCount >= ROSTER_SIZE || handoffStarted) return;
    setDrawnCount((n) => n + 1);
  };

  // Handoff complete: mount the inner H2HRecipientReveal. bypassGameStateGate=true
  // skips the gameState ∈ {REVEALING, RESULTS} check that the wrapper
  // applies when mounted under GameView (this surface has no GameView
  // underneath). gameState="REVEALING" is a synthetic value — only the
  // mount gate reads it, and the bypass overrides that path.
  if (resolvedRoster) {
    return (
      <H2HRecipientReveal
        challengeCtx={challengeCtx}
        myScore={resolvedScore}
        myRoster={resolvedRoster}
        myWinTier={resolvedTier}
        gameState={"REVEALING" as any}
        bypassGameStateGate
        sport={sport}
        renderBattlefieldCard={renderBattlefieldCard}
        renderOverlayCard={renderOverlayCard}
        onSendItBack={onSendItBack}
        onTryAgain={onTryAgain}
        onPlayOwnHand={onPlayOwnHand}
        onDismiss={onDismiss}
      />
    );
  }

  // Headline copy — placeholder for piece 2e. Lock locks the BEHAVIOR
  // (hero zone displays guidance), not the exact words.
  const namedChallenger = isRealName(challengeCtx.challengerName)
    ? challengeCtx.challengerName
    : null;
  const headline = handoffStarted
    ? "Calculating…"
    : drawnCount === 0
      ? `Draw your hand to take on ${namedChallenger ?? "your friend"}.`
      : drawnCount < ROSTER_SIZE
        ? `Slot ${drawnCount + 1} of ${ROSTER_SIZE}`
        : "Roster ready.";

  const drawButtonDisabled = drawnCount >= ROSTER_SIZE || handoffStarted;

  return (
    <div
      data-h2h-recipient-play="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "min(480px, 100%)",
          margin: "0 auto",
          padding: "0 12px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Top strip — sender's face-down hand (P3, P6) */}
        <div
          data-h2h-play-top-strip="true"
          style={{
            marginBottom: TOP_STRIP_MARGIN_BOTTOM_PX,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: STRIP_GAP_PX,
            height: MINI_CELL_HEIGHT_PX,
          }}
        >
          {Array.from({ length: ROSTER_SIZE }).map((_, i) => (
            <FaceDownCell key={i} testId={`top-strip-back-${i}`} />
          ))}
        </div>

        {/* Hero zone — instructional copy (P3) */}
        <div
          data-h2h-play-hero-zone="true"
          style={{
            marginBottom: HERO_ZONE_MARGIN_BOTTOM_PX,
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 20px",
            minHeight: 200,
          }}
        >
          <div
            data-h2h-play-headline="true"
            style={{
              fontSize: 22,
              fontWeight: 800,
              lineHeight: 1.3,
              maxWidth: 320,
              opacity: handoffStarted ? 0.7 : 1,
              transition: "opacity 200ms ease",
            }}
          >
            {headline}
          </div>
        </div>

        {/* Bottom strip — recipient's hand, populating left→right (P3) */}
        <div
          data-h2h-play-bottom-strip="true"
          style={{
            marginBottom: BOTTOM_STRIP_MARGIN_BOTTOM_PX,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: STRIP_GAP_PX,
            height: MINI_CELL_HEIGHT_PX,
          }}
        >
          {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
            const card = i < drawnCount ? initialRoster[i] : null;
            if (card) {
              return (
                <DrawnCardCell
                  key={(card as any).cardId ?? `drawn-${i}`}
                  card={card}
                  testId={`bottom-strip-drawn-${i}`}
                />
              );
            }
            return <EmptyPlaceholderCell key={`empty-${i}`} testId={`bottom-strip-empty-${i}`} />;
          })}
        </div>

        {/* Reserved CTA space — Draw button (piece 2a CTA slot) */}
        <div
          data-h2h-play-reserved="true"
          style={{
            paddingTop: RESERVED_PADDING_TOP_PX,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            minHeight: RESERVED_MIN_HEIGHT_PX,
          }}
        >
          <button
            data-h2h-play-draw-button="true"
            disabled={drawButtonDisabled}
            onClick={handleDraw}
            style={{
              padding: "16px 32px",
              borderRadius: 14,
              background: drawButtonDisabled ? "rgba(255,177,74,0.25)" : "#FFB14A",
              border: "none",
              color: "#070A12",
              fontSize: 17,
              fontWeight: 900,
              cursor: drawButtonDisabled ? "default" : "pointer",
              minWidth: 200,
              fontFamily: "inherit",
              transition: "background 150ms ease",
            }}
          >
            {drawnCount >= ROSTER_SIZE ? "Revealing…" : "Draw"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Face-down cell — sender's hand visual during playing mode. P6 keeps
 *  these face-down through the entire playing phase; they flip during
 *  arc-reveal in the downstream H2HRevealScreen. */
function FaceDownCell({ testId }: { testId?: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.18)",
        background: `
          repeating-linear-gradient(45deg,
            rgba(255,255,255,0.05) 0,
            rgba(255,255,255,0.05) 2px,
            transparent 2px,
            transparent 6px),
          linear-gradient(135deg, #1a2540 0%, #0d1530 50%, #1a2540 100%)
        `,
        boxShadow: "inset 0 0 8px rgba(0,0,0,0.4)",
      }}
    />
  );
}

/** Empty placeholder for un-drawn bottom-strip slots. Dim dashed
 *  outline per P3 ("Empty slots show as placeholders — dim outlines,
 *  no card."). */
function EmptyPlaceholderCell({ testId }: { testId?: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        borderRadius: 6,
        border: "1px dashed rgba(255,255,255,0.18)",
        background: "transparent",
      }}
    />
  );
}

/** Drawn-card cell — stylized identification view. Visual polish
 *  (full AthleteCard render at strip scale) is deferred to piece 2e;
 *  the 2b+2c scope ships an identifiable mini-card showing tier
 *  accent + name + projectedFp + position. */
function DrawnCardCell({ card, testId }: { card: any; testId?: string }) {
  const accent = TIER_ACCENT[String(card.tier ?? "WHITE").toUpperCase()] ?? "#9CA3AF";
  const name = String(card.name ?? "");
  const lastName = name.split(" ").slice(-1)[0] || name;
  return (
    <div
      data-testid={testId}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        borderRadius: 6,
        border: `1.5px solid ${accent}`,
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "4px 3px",
        boxSizing: "border-box",
        animation: "h2h-recipient-play-draw-in 220ms ease-out",
      }}
    >
      <div style={{
        fontSize: 7,
        fontWeight: 800,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: accent,
        lineHeight: 1,
        textAlign: "center",
      }}>{String(card.position ?? "")}</div>
      <div style={{
        fontSize: 9,
        fontWeight: 800,
        color: "#EAF0FF",
        lineHeight: 1.05,
        textAlign: "center",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>{lastName}</div>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: "rgba(255,255,255,0.55)",
        textAlign: "center",
        lineHeight: 1,
      }}>{Number(card.projectedFp ?? 0).toFixed(0)}</div>
      <style>{`
        @keyframes h2h-recipient-play-draw-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

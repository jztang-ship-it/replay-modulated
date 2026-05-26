/**
 * basketball/src/dev/H2HRevealMockRoute.tsx
 *
 * Dev-only mount for the H2H reveal arc. Wires the basketball mock
 * fixture into the sport-agnostic H2HRevealScreen with AthleteCard as
 * the battlefield card renderer.
 *
 * Phase 2 (static): mounted unchanged below — H2HRevealScreen with no
 *   `reveal` prop renders the end-state.
 * Phase 3 (animated): also mounts useH2HReveal alongside, passes it to
 *   the screen via the `reveal` prop. Dev controls (Play/Replay/Skip)
 *   overlay in the bottom-right. Optional `?autoplay=1` URL flag fires
 *   `play()` on mount.
 *
 * Mounted at pathname /basketball/dev/h2h-reveal-mock via regex match
 * in basketball/src/App.tsx. Production users have no entry point to
 * /dev/* paths.
 *
 * Phase 4 will replace the fixture import with a fetch against
 * /api/challenge/{id}/sender-hand; the same renderCard wiring + the
 * same H2HRevealScreen component + the same hook carry forward.
 */

import { useEffect } from "react";
import {
  H2HRevealScreen,
  usePrefersReducedMotion,
  type H2HCard,
  type CardRenderer,
} from "@shared/components/H2HRevealScreen";
import {
  useH2HReveal,
  MATCHUP_DURATION_MS,
} from "@shared/components/useH2HReveal";
import { AthleteCard } from "../components/AthleteCard";
import { SENDER_HAND, RECIPIENT_HAND } from "./h2hMockFixture";
import type { PlayerCard } from "../adapters/types";

// AthleteCard wrapper. Static end-state and animated reveal both flow
// through this single renderer; the difference is whether `visibleFp`
// is set.
//
// Static (options=undefined): visibleFp prop is undefined → with
//   phase=RESULTS, CardFront shows actualFp directly (CardFront.tsx:448).
// Animated (options.visibleFp=0.001 sentinel): CardFront's internal
//   visibleFp effect fires → kicks off its RAF rollup 0→actualFp using
//   fpCountUpMs as the duration. We pass MATCHUP_DURATION_MS so the
//   per-card animation finishes at the same instant the hook's running
//   totals settle.
const renderBattlefieldCard: CardRenderer = (card: H2HCard, options) => (
  <AthleteCard
    card={card as unknown as PlayerCard}
    phase={"RESULTS" as any}
    isFlipped={false}
    canFlip={false}
    locked={card.wasHeld}
    heldFpVisible={true}
    badges={card.achievements}
    visibleFp={options?.visibleFp}
    fpCountUpMs={MATCHUP_DURATION_MS}
  />
);

// Read `?autoplay=1` once at module load. Browsers without window
// (vitest/SSR smoke) get false.
function readAutoplay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("autoplay") === "1";
  } catch {
    return false;
  }
}

export function H2HRevealMockRoute() {
  const reducedMotion = usePrefersReducedMotion();
  const reveal = useH2HReveal({
    sender: SENDER_HAND,
    recipient: RECIPIENT_HAND,
    reducedMotion,
    onMatchupResolved: (index, _matchup, state) => {
      // Phase 5 will wire commentary here; for dev iteration we just
      // log so the hook's callback contract is exercised.
      // eslint-disable-next-line no-console
      console.info("[h2h-mock] matchup resolved", index, state);
    },
    onArcResolved: (state) => {
      // eslint-disable-next-line no-console
      console.info("[h2h-mock] arc resolved", state);
    },
  });

  useEffect(() => {
    if (readAutoplay()) reveal.play();
    // Intentionally one-shot on mount — `reveal.play` identity isn't
    // stable, but we only want to autoplay once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <H2HRevealScreen
        sender={SENDER_HAND}
        recipient={RECIPIENT_HAND}
        renderCard={renderBattlefieldCard}
        reveal={reveal}
      />
      <DevControls
        phase={reveal.phase}
        matchupIndex={reveal.matchupIndex}
        matchupCount={reveal.matchupCount}
        entranceSettledCount={reveal.entranceSettledCount}
        pulseActive={reveal.pulseActive}
        onPlay={reveal.play}
        onSkip={reveal.skipToEnd}
      />
    </>
  );
}

// ── Dev-only control overlay ──────────────────────────────────────────────
// Bottom-right fixed cluster. Buttons are intentionally small + low-
// contrast so they don't dominate the visual smoke screenshots; the
// reveal screen itself is the artifact being evaluated.

interface DevControlsProps {
  phase: string;
  matchupIndex: number;
  matchupCount: number;
  entranceSettledCount: number;
  pulseActive: boolean;
  onPlay: () => void;
  onSkip: () => void;
}

function DevControls({ phase, matchupIndex, matchupCount, entranceSettledCount, pulseActive, onPlay, onSkip }: DevControlsProps) {
  const isAnimating = phase === "entering" || phase === "anticipating" || phase === "revealing" || phase === "paused" || phase === "end-hold";
  const playLabel = phase === "done" ? "Replay" : "Play";
  // Replay button is hidden during end-hold so the user can absorb the
  // climax without next-step UI appearing. Skip is also hidden in the
  // hold (skipping a settle period isn't meaningful).
  const showPlay = phase !== "end-hold";
  const showSkip = phase !== "end-hold";
  // Phase-specific progress string. "entering" shows settled/total
  // cards; "anticipating" shows still/pulse/settle sub-state.
  const progress = phase === "entering"
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
        zIndex: 9100,
        display: "flex",
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        padding: "6px 8px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
        color: "rgba(255,255,255,0.85)",
      }}
    >
      <span
        data-h2h-dev-phase={phase}
        style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}
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
      {showSkip && (
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
    </div>
  );
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

/**
 * shared/components/SeasonReel.tsx
 *
 * Slot-machine-style year reveal. Mounts at game entry once per UTC day,
 * fast-spins through all season labels, decelerates, lands on the
 * predetermined target with a small spring oscillation, then signals
 * completion so gameplay can proceed.
 *
 * The choice is predetermined by `pickTodaysSeason` — the reel is purely
 * the reveal animation. Animation does not change which season is picked.
 *
 * Animation phases (4 seconds total by default):
 *   0.00 - 0.55  Fast spin (linear-ish), covers ~75% of the rolling distance
 *   0.55 - 0.92  Deceleration (ease-out cubic)
 *   0.92 - 1.00  Damped spring oscillation around the target — overshoots,
 *                pulls back, overshoots smaller, settles
 *
 * Implementation: pure RAF, no animation library. Single composed easing
 * function so phase boundaries don't visibly stutter.
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  /** All season labels in display order (typically chronological). */
  labels: string[];
  /** The predetermined winner — must be present in `labels`. */
  targetLabel: string;
  /** Total animation duration in ms. */
  durationMs?: number;
  /** Pixel height of one reel row. */
  rowHeightPx?: number;
  /** How many full passes through the label list before landing. */
  cycles?: number;
  /** Caption above the reel; defaults to "TODAY'S SLATE". */
  caption?: string;
  /** Fired once after the spring settles. */
  onComplete?: () => void;
};

export function SeasonReel({
  labels,
  targetLabel,
  durationMs = 4000,
  rowHeightPx = 64,
  cycles = 8,
  caption = "TODAY'S SLATE",
  onComplete,
}: Props) {
  const [translatePx, setTranslatePx] = useState(0);
  const [settled, setSettled] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!labels.length) return;
    const targetIdx = Math.max(0, labels.indexOf(targetLabel));
    if (targetIdx < 0) return;

    // We render N+1 copies of the label list stacked, so the reel can roll
    // through several full cycles before landing on the target's last copy.
    // Final translateY = (cycles * length + targetIdx) * rowHeight.
    const finalDistance = (cycles * labels.length + targetIdx) * rowHeightPx;

    const start = performance.now();

    const frame = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);

      // Composed eased progress:
      //   - Fast spin (eased linearly with slight ease-in for windup feel)
      //   - Deceleration via ease-out cubic
      //   - Spring oscillation as t → 1
      let progress: number;
      if (t < 0.55) {
        // Phase 1: fast spin. We use a slightly ease-in curve so the start
        // feels like a windup, not an instant blur.
        const localT = t / 0.55;
        const eased = Math.pow(localT, 1.4); // gentle ease-in
        progress = eased * 0.75;
      } else if (t < 0.92) {
        // Phase 2: decel. Cover the remaining 0.75 → 0.99 of distance with
        // a cubic ease-out, leaving a tiny bit for the spring band.
        const localT = (t - 0.55) / 0.37;
        const eased = 1 - Math.pow(1 - localT, 3);
        progress = 0.75 + eased * 0.24;
      } else {
        // Phase 3: damped spring oscillation around 1.0. Critical-damped
        // cosine: amplitude * exp(-damping * τ) * cos(freq * τ).
        // Total drift adds up to land cleanly at progress = 1 by t = 1.
        const localT = (t - 0.92) / 0.08;
        const damping = 5;
        const freq = 16;
        // Amplitude is small so oscillation overshoots by ~1 row max.
        const amplitudePct = (rowHeightPx * 1.0) / finalDistance;
        const oscillation = amplitudePct * Math.exp(-damping * localT) * Math.cos(freq * localT);
        progress = 0.99 + 0.01 * localT + oscillation;
      }

      setTranslatePx(progress * finalDistance);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Snap to exact target pixel — eliminates any sub-pixel drift from
        // the spring math.
        setTranslatePx(finalDistance);
        setSettled(true);
        // Brief celebrate-the-landing pause before signaling complete.
        setTimeout(() => setRevealed(true), 250);
        setTimeout(() => onCompleteRef.current?.(), 900);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally one-shot — re-mounting the component restarts the reveal

  // Stack many copies of labels so the reel has length to scroll through.
  // (cycles + 1) copies guarantees we always have a row to land on.
  const stripCopies = cycles + 2;
  const stripRows: string[] = [];
  for (let i = 0; i < stripCopies; i++) stripRows.push(...labels);

  // The "winning" row sits exactly at translateY = (cycles * length + targetIdx) * rowHeight.
  // Centering the reel window around row index = cycles*length + targetIdx means
  // the visible row is the target. Window height = rowHeight (one row visible).
  const reelWindowHeight = rowHeightPx;

  return (
    <div
      role="dialog"
      aria-label="Today's slate season selection"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "radial-gradient(ellipse at center, rgba(15,20,38,0.96) 0%, rgba(5,8,18,0.99) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        backdropFilter: "blur(8px)",
        animation: "seasonReelFadeIn 250ms ease",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes seasonReelFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes seasonReelTargetPulse {
          0%   { transform: scale(1);   filter: drop-shadow(0 0 12px rgba(255,215,0,0.6)); }
          50%  { transform: scale(1.05); filter: drop-shadow(0 0 24px rgba(255,215,0,0.9)); }
          100% { transform: scale(1);   filter: drop-shadow(0 0 12px rgba(255,215,0,0.6)); }
        }
      `}</style>

      <div style={{
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "0.4em",
        color: "rgba(255,215,0,0.85)",
        textTransform: "uppercase",
      }}>
        {caption}
      </div>

      <div
        style={{
          position: "relative",
          width: 320,
          height: reelWindowHeight,
          overflow: "hidden",
          borderTop: "2px solid rgba(255,215,0,0.55)",
          borderBottom: "2px solid rgba(255,215,0,0.55)",
          background: "rgba(0,0,0,0.6)",
          boxShadow:
            "inset 0 30px 30px -20px rgba(0,0,0,0.9), inset 0 -30px 30px -20px rgba(0,0,0,0.9), 0 0 40px rgba(255,215,0,0.1)",
        }}
      >
        <div
          style={{
            transform: `translateY(-${translatePx}px)`,
            willChange: "transform",
          }}
        >
          {stripRows.map((label, i) => {
            // Highlight the row the reel will land on (only matters once
            // we're close to the end; visual effect is gold tint + pulse).
            const isTarget = settled && i === cycles * labels.length + Math.max(0, labels.indexOf(targetLabel));
            return (
              <div
                key={i}
                style={{
                  height: rowHeightPx,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Impact', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 36,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  color: isTarget && revealed ? "#FFD700" : "rgba(240,242,245,0.92)",
                  textShadow: isTarget && revealed ? "0 0 16px rgba(255,215,0,0.6)" : "none",
                  animation: isTarget && revealed ? "seasonReelTargetPulse 600ms ease 2" : undefined,
                  transition: "color 200ms ease, text-shadow 200ms ease",
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* Top + bottom gradient masks for "fading off the edge" effect. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.7) 100%)",
          }}
        />
      </div>

      <div
        style={{
          minHeight: 24,
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255,255,255,0.55)",
          letterSpacing: "0.06em",
          opacity: revealed ? 1 : 0,
          transition: "opacity 350ms ease",
        }}
      >
        Your slate is set. Tap anywhere to begin.
      </div>
    </div>
  );
}

/**
 * shared/components/SeasonReel.tsx
 *
 * Slot-machine year reveal. One pass through all years, decelerates into
 * the target, then a single small spring overshoot before settling.
 *
 * Animation phases (1.4 s default):
 *   0.00 – 0.55  Fast scroll through years (cubic ease-in)
 *   0.55 – 0.85  Gradual deceleration (cubic ease-out)
 *   0.85 – 1.00  Single spring: slight overshoot then settle on target
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  labels: string[];
  targetLabel: string;
  durationMs?: number;
  rowHeightPx?: number;
  cycles?: number;
  caption?: string;
  onComplete?: () => void;
};

export function SeasonReel({
  labels,
  targetLabel,
  durationMs = 1400,
  rowHeightPx = 64,
  cycles = 1,
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
    const finalDistance = (cycles * labels.length + targetIdx) * rowHeightPx;

    // Spring overshoot: ~0.35 rows past target, then pulls back to land.
    const springAmp = (rowHeightPx * 0.35) / finalDistance;

    const start = performance.now();

    const frame = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);

      let progress: number;
      if (t < 0.55) {
        // Phase 1: fast scroll through years, cubic ease-in.
        const localT = t / 0.55;
        progress = Math.pow(localT, 3) * 0.78;
      } else if (t < 0.85) {
        // Phase 2: gradual deceleration, cubic ease-out.
        const localT = (t - 0.55) / 0.30;
        progress = 0.78 + (1 - Math.pow(1 - localT, 3)) * 0.22;
      } else {
        // Phase 3: single spring — overshoot then settle on target.
        const localT = (t - 0.85) / 0.15;
        // sin peak at localT=0.5, decays exponentially → one clean bounce
        const spring = springAmp * Math.sin(localT * Math.PI) * Math.exp(-localT * 3);
        progress = 1.0 + spring;
      }

      setTranslatePx(progress * finalDistance);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setTranslatePx(finalDistance);
        setSettled(true);
        setTimeout(() => setRevealed(true), 60);
        setTimeout(() => onCompleteRef.current?.(), 420);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stripCopies = cycles + 2;
  const stripRows: string[] = [];
  for (let i = 0; i < stripCopies; i++) stripRows.push(...labels);

  // 3-row window: prev / target / next. The middle slot is the landing zone.
  const windowHeight = rowHeightPx * 3;

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
        animation: "seasonReelFadeIn 200ms ease",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes seasonReelFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes seasonReelThud {
          0%   { transform: scale(1.06); filter: drop-shadow(0 0 20px rgba(255,215,0,0.95)); }
          60%  { transform: scale(1.01); filter: drop-shadow(0 0 10px rgba(255,215,0,0.6)); }
          100% { transform: scale(1);   filter: drop-shadow(0 0 8px rgba(255,215,0,0.4)); }
        }
      `}</style>

      <div style={{
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: "0.42em",
        color: "rgba(255,215,0,0.8)",
        textTransform: "uppercase",
      }}>
        {caption}
      </div>

      <div
        style={{
          position: "relative",
          width: 320,
          height: windowHeight,
          overflow: "hidden",
          borderTop: "2px solid rgba(255,215,0,0.6)",
          borderBottom: "2px solid rgba(255,215,0,0.6)",
          background: "rgba(0,0,0,0.55)",
          boxShadow:
            "inset 0 40px 40px -20px rgba(0,0,0,0.95), inset 0 -40px 40px -20px rgba(0,0,0,0.95), 0 0 40px rgba(255,215,0,0.08)",
        }}
      >
        {/* Center-row landing zone highlight */}
        <div style={{
          position: "absolute",
          top: rowHeightPx,
          left: 0,
          right: 0,
          height: rowHeightPx,
          background: settled
            ? "rgba(255,215,0,0.06)"
            : "rgba(255,255,255,0.02)",
          transition: "background 150ms ease",
          pointerEvents: "none",
          zIndex: 1,
        }} />

        {/* Scrolling strip — translateY starts at -rowHeightPx so center row
            of the 3-row window aligns with index 0; target lands in center. */}
        <div
          style={{
            transform: `translateY(${rowHeightPx - translatePx}px)`,
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          {stripRows.map((label, i) => {
            const isTarget =
              settled && i === cycles * labels.length + Math.max(0, labels.indexOf(targetLabel));
            const distFromCenter = Math.abs(
              i - (cycles * labels.length + Math.max(0, labels.indexOf(targetLabel)))
            );
            // Non-target rows fade out proportional to distance from landing zone.
            const opacity = settled
              ? isTarget ? 1 : Math.max(0.12, 0.5 - distFromCenter * 0.15)
              : 0.85;

            return (
              <div
                key={i}
                style={{
                  height: rowHeightPx,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Impact', 'Arial Narrow', Arial, sans-serif",
                  fontSize: 38,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  color: isTarget && revealed ? "#FFD700" : "rgba(235,238,245,0.92)",
                  opacity,
                  animation: isTarget && revealed ? "seasonReelThud 400ms ease forwards" : undefined,
                  transition: "color 120ms ease, opacity 200ms ease",
                  textRendering: "optimizeSpeed",
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* Top + bottom gradient masks — heavier to sell the 3D drum feel. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 28%, transparent 42%, transparent 58%, rgba(0,0,0,0.2) 72%, rgba(0,0,0,0.85) 100%)",
            zIndex: 2,
          }}
        />
      </div>

      <div
        style={{
          minHeight: 20,
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          opacity: revealed ? 1 : 0,
          transition: "opacity 250ms ease",
        }}
      >
        Tap anywhere to begin
      </div>
    </div>
  );
}

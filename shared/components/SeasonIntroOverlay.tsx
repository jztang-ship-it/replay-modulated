/**
 * shared/components/SeasonIntroOverlay.tsx
 *
 * Fullscreen intro card that follows the SeasonReel. Shows a one-sentence
 * highlight of the season the user just landed on, plus a FTUE-only
 * follow-up about the scoring-rules icon.
 *
 * Returning user flow:
 *   reel completes → intro overlay (intro text + "Tap to start" button)
 *
 * FTUE user flow:
 *   FTUE coach finishes → reel plays → intro overlay (intro text +
 *   "Alright you're in. Tap the gold icon to see all the scoring rules.")
 *
 * Sport-agnostic component — basketball passes the intro text from
 * basketball/src/data/seasonIntros.json. Other sports can opt in by
 * supplying their own intro lookups.
 */

import { useEffect, useState } from "react";

type Props = {
  seasonLabel: string;
  introText: string;
  /** Called when the user dismisses (tap anywhere / tap the button). */
  onDismiss: () => void;
};

export function SeasonIntroOverlay({ seasonLabel, introText, onDismiss }: Props) {
  // Tiny mount-in delay so the overlay doesn't read as a jump-cut from the reel.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Season intro"
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "radial-gradient(ellipse at center, rgba(15,20,38,0.96) 0%, rgba(5,8,18,0.99) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        backdropFilter: "blur(8px)",
        animation: "seasonIntroFadeIn 220ms ease",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "0 28px",
        cursor: "pointer",
      }}
    >
      <style>{`
        @keyframes seasonIntroFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes seasonIntroPop {
          0%   { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0);   opacity: 1; }
        }
      `}</style>

      {/* Season label — small, gold caption above body */}
      <div style={{
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: "0.42em",
        color: "rgba(255,215,0,0.8)",
        textTransform: "uppercase",
        opacity: ready ? 1 : 0,
        transition: "opacity 220ms ease",
      }}>
        {seasonLabel}
      </div>

      {/* Intro line — main copy */}
      <div style={{
        maxWidth: 520,
        fontSize: 18,
        lineHeight: 1.45,
        fontWeight: 700,
        color: "rgba(238,238,250,0.96)",
        textAlign: "center",
        animation: ready ? "seasonIntroPop 360ms cubic-bezier(0.2,0.8,0.2,1) forwards" : undefined,
        opacity: ready ? undefined : 0,
      }}>
        {introText}
      </div>

      {/* Hint to dismiss */}
      <div style={{
        marginTop: 14,
        fontSize: 11,
        fontWeight: 600,
        color: "rgba(255,255,255,0.5)",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        opacity: ready ? 1 : 0,
        transition: "opacity 300ms ease 380ms",
      }}>
        Tap anywhere to start
      </div>
    </div>
  );
}

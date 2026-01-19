import { useEffect, useState } from "react";
import type { GamePhase } from "../adapters/types";

function useIsNarrow(breakpointPx = 640) {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < breakpointPx
  );

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < breakpointPx);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpointPx]);

  return isNarrow;
}

export function Controls(props: {
  phase: GamePhase;
  onDeal: () => void;
  onRedraw: () => void;
  onReplay: () => void;
}) {
  const { phase, onDeal, onRedraw, onReplay } = props;
  const isNarrow = useIsNarrow(720);

  const primary =
    phase === "DEAL"
      ? { label: "DEAL", onClick: onDeal, disabled: false }
      : phase === "HOLD"
      ? { label: "REDRAW", onClick: onRedraw, disabled: false }
      : phase === "DRAW"
      ? { label: "REDRAW", onClick: onRedraw, disabled: true }
      : { label: "REPLAY", onClick: onReplay, disabled: false };

  return (
    <div
      style={{
        position: isNarrow ? "sticky" : "relative",
        bottom: isNarrow ? 0 : "auto",
        zIndex: 20,
        padding: isNarrow ? "10px 12px calc(env(safe-area-inset-bottom) + 10px)" : 0,
        background: isNarrow ? "linear-gradient(to top, #ffffff 70%, rgba(255,255,255,0.85))" : "transparent",
        borderTop: isNarrow ? "1px solid rgba(0,0,0,0.08)" : "none",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <button
        onClick={primary.onClick}
        disabled={primary.disabled}
        style={{
          width: isNarrow ? "100%" : 220,
          maxWidth: 420,
          padding: isNarrow ? "14px 16px" : "12px 18px",
          borderRadius: 16,
          border: "none",
          fontSize: isNarrow ? 18 : 16,
          fontWeight: 950,
          letterSpacing: 0.6,
          background: primary.disabled
            ? "linear-gradient(180deg, #e5e7eb, #d1d5db)"
            : "linear-gradient(180deg, #111827, #000000)",
          color: "white",
          cursor: primary.disabled ? "not-allowed" : "pointer",
          opacity: primary.disabled ? 0.65 : 1,
          boxShadow: primary.disabled
            ? "none"
            : "0 10px 24px rgba(0,0,0,0.28)",
          transition: "transform 120ms ease, box-shadow 120ms ease",
        }}
        onMouseDown={(e) => {
          if (!primary.disabled) e.currentTarget.style.transform = "translateY(1px)";
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        {primary.label}
      </button>
    </div>
  );
}

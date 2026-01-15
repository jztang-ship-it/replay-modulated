import type { GamePhase } from "../engine/types";

export function Controls(props: {
  phase: GamePhase;
  onDeal: () => void;
  onRedraw: () => void;
  onReplay: () => void;
}) {
  const { phase, onDeal, onRedraw, onReplay } = props;

  const primary =
    phase === "DEAL" ? { label: "DEAL", onClick: onDeal, disabled: false } :
    phase === "HOLD" ? { label: "REDRAW", onClick: onRedraw, disabled: false } :
    phase === "DRAW" ? { label: "REDRAW", onClick: onRedraw, disabled: true } :
    { label: "REPLAY", onClick: onReplay, disabled: false };

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
      <button
        onClick={primary.onClick}
        disabled={primary.disabled}
        style={{
          padding: "12px 18px",
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.2)",
          fontSize: 16,
          fontWeight: 900,
          cursor: primary.disabled ? "not-allowed" : "pointer",
          opacity: primary.disabled ? 0.6 : 1,
          minWidth: 180,
        }}
      >
        {primary.label}
      </button>
    </div>
  );
}

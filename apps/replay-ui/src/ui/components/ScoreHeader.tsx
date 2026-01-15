import type { GamePhase } from "../engine/types";

export function ScoreHeader(props: {
  totalFp: number;
  capUsed: number;
  capMax: number;
  phase: GamePhase;
  subtitle: string;
}) {
  const { totalFp, capUsed, capMax, subtitle } = props;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.5 }}>REPLAY</div>
        <div style={{ opacity: 0.75, marginTop: 4 }}>{subtitle}</div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>TEAM FP</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{totalFp.toFixed(1)}</div>
        </div>

        <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", minWidth: 140 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>SALARY</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {capUsed}/{capMax}
          </div>
        </div>
      </div>
    </div>
  );
}

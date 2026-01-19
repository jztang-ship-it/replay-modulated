import type { GamePhase } from "../adapters/types";

export function ScoreHeader(props: {
  totalFp: number;
  capUsed: number;
  capMax: number;
  heldSalary: number;
  capRemaining: number;
  phase: GamePhase;
  subtitle: string;
}) {
  const { totalFp, capUsed, capMax, heldSalary, capRemaining, phase, subtitle } = props;

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

        <div style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", minWidth: 220 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>SALARY CAP</div>

          {phase === "HOLD" ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>HELD</div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{heldSalary}/{capMax}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>REMAINING</div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{capRemaining}</div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 900 }}>
              {Math.round(capUsed)}/{capMax}
            </div>
          )}

          <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (capUsed / capMax) * 100)}%`,
                background: "rgba(0,0,0,0.55)",
                transition: "width 220ms ease",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

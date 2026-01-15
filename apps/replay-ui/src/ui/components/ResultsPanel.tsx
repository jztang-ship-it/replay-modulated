import { useMemo } from "react";
import type { PlayerCard } from "../engine/types";

export function ResultsPanel(props: { totalFp: number; winTierLabel: string; topCards: PlayerCard[] }) {
  const { totalFp, winTierLabel, topCards } = props;

  const top3 = useMemo(() => {
    return [...topCards]
      .sort((a, b) => (b.actualFp ?? 0) - (a.actualFp ?? 0))
      .slice(0, 3);
  }, [topCards]);

  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 14, opacity: 0.75 }}>Outcome</div>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{winTierLabel}</div>
      </div>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 14, opacity: 0.75 }}>Total FP</div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>{totalFp.toFixed(1)}</div>
      </div>

      <div style={{ marginTop: 12, fontSize: 14, fontWeight: 900 }}>Top Contributors</div>
      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
        {top3.map((c) => (
          <div key={c.cardId} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              {c.name} <span style={{ opacity: 0.7 }}>({c.team}, {c.season})</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 900 }}>{(c.actualFp ?? 0).toFixed(1)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Tip: Tap a card to flip and see the stat breakdown.
      </div>
    </div>
  );
}

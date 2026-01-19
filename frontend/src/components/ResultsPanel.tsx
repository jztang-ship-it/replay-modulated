import type { PlayerCard } from "../adapters/types";

export function ResultsPanel(props: {
  totalFp: number;
  winTierLabel: string;
  topCards: PlayerCard[];
  topContributors?: Array<{ cardId: string; name: string; fp: number }>;
}) {
  const { totalFp, winTierLabel, topContributors } = props;

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>RESULT</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{winTierLabel || "STANDARD"}</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>TOTAL FP</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{totalFp.toFixed(1)}</div>
        </div>
      </div>

      {topContributors && topContributors.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>TOP CONTRIBUTORS</div>

          <div style={{ display: "grid", gap: 8 }}>
            {topContributors.slice(0, 3).map((t, idx) => (
              <div
                key={t.cardId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      fontWeight: 900,
                      background: "rgba(0,0,0,0.10)",
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ fontWeight: 800 }}>{t.name}</div>
                </div>

                <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900 }}>
                  {t.fp.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

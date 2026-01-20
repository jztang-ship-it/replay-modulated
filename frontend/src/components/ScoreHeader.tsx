import React, { useMemo } from "react";

type Phase = "HOLD" | "RESULTS";

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

export function ScoreHeader(props: {
  totalFp: number;
  capUsed: number;
  capMax: number;
  heldSalary: number;
  capRemaining: number;
  phase: Phase;
  subtitle?: string;
}) {
  const { totalFp, capUsed, capMax } = props;

  const salaryText = useMemo(() => {
    return `${Math.round(capUsed)}/${Math.round(capMax)}`;
  }, [capUsed, capMax]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 0.9fr 0.9fr",
        alignItems: "center",
        gap: 10,
        minHeight: 40, // ~2/3 of prior 54-ish
        padding: "2px 2px",
      }}
    >
      {/* REPLAY */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 18, // ~2/3
            fontWeight: 950,
            letterSpacing: 1.1,
            lineHeight: "20px",
          }}
        >
          REPLAY
        </div>
      </div>

      {/* TEAM FP */}
      <div style={{ justifySelf: "end", textAlign: "right" }}>
        <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.4, fontWeight: 900 }}>
          TEAM FP
        </div>
        <div
          style={{
            fontSize: 14, // ~1/2 of the big number you had
            fontWeight: 950,
            letterSpacing: 0.4,
            lineHeight: "16px",
          }}
        >
          {round1(totalFp)}
        </div>
      </div>

      {/* SALARY */}
      <div style={{ justifySelf: "end", textAlign: "right" }}>
        <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.4, fontWeight: 900 }}>
          SALARY
        </div>
        <div
          style={{
            fontSize: 14, // number 1/2 size
            fontWeight: 950,
            letterSpacing: 0.4,
            lineHeight: "16px",
          }}
        >
          {salaryText}
        </div>
      </div>
    </div>
  );
}

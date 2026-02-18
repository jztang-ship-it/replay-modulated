import React from "react";
import type { GamePhase } from "../adapters/types";
import { BalanceDisplay } from "./BalanceDisplay";

type Props = {
  totalFp: number;
  capUsed: number;
  capMax: number;
  capRemaining: number;
  phase: GamePhase;
  subtitle: string;
  balance: number;
  isBalanceAnimating?: boolean;
};

export function ScoreHeader(props: Props) {
  const { totalFp, capRemaining, capMax, balance, isBalanceAnimating } = props;

  // Clean calculation: budget left
  const budgetLeft = capRemaining;
  const isOverBudget = budgetLeft < 0;

  const container: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 12,
  };

  const centerSection: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    gap: 20,
  };

  const statBlock: React.CSSProperties = {
    textAlign: "center",
  };

  const label: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.8,
    opacity: 0.75,
    textTransform: "uppercase",
    marginBottom: 2,
  };

  const value: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: 0.5,
  };

  const switchButtonStyle: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#EAF0FF",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.8,
    cursor: "pointer",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  return (
    <div style={container}>
      {/* Left: Balance */}
      <BalanceDisplay balance={balance} isAnimating={isBalanceAnimating} />

      {/* Center: Team FP & Budget */}
      <div style={centerSection}>
        <div style={statBlock}>
          <div style={label}>TEAM FP</div>
          <div style={value}>{totalFp.toFixed(1)}</div>
        </div>
        
        <div style={statBlock}>
          <div style={label}>BUDGET</div>
          <div style={{
            ...value,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 2,
          }}>
            <span style={{ color: isOverBudget ? "#ef4444" : "#EAF0FF" }}>
              {budgetLeft}
            </span>
            <span style={{ 
              fontSize: 14, 
              opacity: 0.6,
              fontWeight: 800,
            }}>
              /{capMax}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Sport Switcher */}
      <button
        style={switchButtonStyle}
        onClick={() => window.open('https://replay-ifs-v2.vercel.app/play', '_blank')}
        title="Switch to Basketball"
      >
        🏀 Basketball
      </button>
    </div>
  );
}
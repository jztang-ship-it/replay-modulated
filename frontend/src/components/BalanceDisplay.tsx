import React from "react";

type Props = {
  balance: number;
  isAnimating?: boolean;
};

export function BalanceDisplay({ balance, isAnimating }: Props) {
  const displayBalance = Math.max(0, balance);
  
  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.8,
    opacity: 0.75,
    textTransform: "uppercase",
  };

  const amountStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 950,
    letterSpacing: 0.5,
    color: isAnimating ? "#36D46B" : "#EAF0FF",
    transition: "color 300ms ease",
  };

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>BALANCE</div>
      <div style={amountStyle}>${displayBalance.toLocaleString()}</div>
    </div>
  );
}
import React, { useEffect, useState } from "react";

// Must match payoutLogic.ts WinTier
type WinTier = "BUST" | "BRONZE" | "GOLD" | "MVP" | "JACKPOT";

type Props = {
  tier: WinTier;
  payout: number;
  multiplier: number;
  onComplete: () => void;
};

function getTierConfig(tier: WinTier) {
  switch (tier) {
    case "JACKPOT":
      return {
        label: "🎰 JACKPOT! 🎰",
        color: "#FFD700",
        glow: "rgba(255,215,0,0.4)",
        scale: 1.2,
        confetti: true,
        duration: 4000,
      };
    case "MVP":
      return {
        label: "🔥 MVP ROUND! 🔥",
        color: "#FF6B35",
        glow: "rgba(255,107,53,0.3)",
        scale: 1.1,
        confetti: true,
        duration: 3500,
      };
    case "GOLD":
      return {
        label: "⭐ GOLD! ⭐",
        color: "#FFD700",
        glow: "rgba(255,215,0,0.25)",
        scale: 1.05,
        confetti: false,
        duration: 3000,
      };
    case "BRONZE":
      return {
        label: "🥉 BRONZE",
        color: "#CD7F32",
        glow: "rgba(205,127,50,0.2)",
        scale: 1.0,
        confetti: false,
        duration: 2000,
      };
    case "BUST":
      return {
        label: "💀 BUST",
        color: "#A0AEC0",
        glow: "rgba(160,174,192,0.15)",
        scale: 1.0,
        confetti: false,
        duration: 1500,
      };
  }
}

export function WinCelebration({ tier, payout, multiplier, onComplete }: Props) {
  const [visible, setVisible] = useState(false);
  const [balanceRoll, setBalanceRoll] = useState(0);

  const config = getTierConfig(tier);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);

    if (payout > 0) {
      const steps = 30;
      const increment = payout / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= payout) {
          setBalanceRoll(payout);
          clearInterval(interval);
        } else {
          setBalanceRoll(Math.floor(current));
        }
      }, 1500 / steps);
    }

    const timeout = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300);
    }, config.duration);

    return () => clearTimeout(timeout);
  }, [payout, tier, onComplete, config.duration]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
      onClick={onComplete}
    >
      <div
        style={{
          padding: "40px 60px",
          borderRadius: 24,
          background: "linear-gradient(180deg,rgba(15,20,35,0.97),rgba(8,12,22,0.99))",
          border: `2px solid ${config.color}`,
          boxShadow: `0 0 60px ${config.glow}, 0 20px 60px rgba(0,0,0,0.6)`,
          textAlign: "center",
          transform: visible ? `scale(${config.scale})` : "scale(0.8)",
          transition: "transform 400ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          fontSize: 42,
          fontWeight: 950,
          color: config.color,
          marginBottom: 20,
          textShadow: `0 0 30px ${config.glow}`,
          letterSpacing: 2,
        }}>
          {config.label}
        </div>

        {payout > 0 ? (
          <>
            <div style={{ fontSize: 32, fontWeight: 950, color: "#36D46B", marginBottom: 10 }}>
              +${balanceRoll.toLocaleString()}
            </div>
            <div style={{ fontSize: 16, opacity: 0.75, color: "#EAF0FF" }}>
              {multiplier}x multiplier
            </div>
          </>
        ) : (
          <div style={{ fontSize: 16, opacity: 0.75, color: "#EAF0FF", marginTop: 10 }}>
            Better luck next time!
          </div>
        )}
      </div>

      {config.confetti && visible && <Confetti color={config.color} />}
    </div>
  );
}

function Confetti({ color }: { color: string }) {
  const colors = [color, "#FFD700", "#FF6B35", "#4ECDC4", "#A78BFA"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 2 + Math.random() * 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: "-20px",
              width: 10,
              height: 10,
              background: colors[Math.floor(Math.random() * colors.length)],
              borderRadius: "50%",
              animation: `fall ${duration}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
      <style>{`@keyframes fall { to { transform: translateY(100vh) rotate(360deg); opacity: 0; } }`}</style>
    </div>
  );
}
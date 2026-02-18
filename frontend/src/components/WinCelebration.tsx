import React, { useEffect, useState } from "react";

type WinTier = "LOSS" | "SMALL_WIN" | "MEDIUM_WIN" | "BIG_WIN" | "JACKPOT";

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
        glow: "rgba(255, 215, 0, 0.4)",
        scale: 1.2,
        confetti: true,
      };
    case "BIG_WIN":
      return {
        label: "🔥 BIG WIN! 🔥",
        color: "#FF6B35",
        glow: "rgba(255, 107, 53, 0.3)",
        scale: 1.1,
        confetti: true,
      };
    case "MEDIUM_WIN":
      return {
        label: "⭐ WIN! ⭐",
        color: "#4ECDC4",
        glow: "rgba(78, 205, 196, 0.3)",
        scale: 1.05,
        confetti: false,
      };
    case "SMALL_WIN":
      return {
        label: "✓ Small Win",
        color: "#95E1D3",
        glow: "rgba(149, 225, 211, 0.2)",
        scale: 1.0,
        confetti: false,
      };
    case "LOSS":
      return {
        label: "Try Again",
        color: "#A0AEC0",
        glow: "rgba(160, 174, 192, 0.15)",
        scale: 1.0,
        confetti: false,
      };
  }
}

export function WinCelebration({ tier, payout, multiplier, onComplete }: Props) {
  const [visible, setVisible] = useState(false);
  const [balanceRoll, setBalanceRoll] = useState(0);
  
  const config = getTierConfig(tier);
  
  useEffect(() => {
    // Fade in
    setTimeout(() => setVisible(true), 100);
    
    // Roll up balance
    if (payout > 0) {
      const duration = 1500;
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
      }, duration / steps);
    }
    
    // Auto-dismiss
    const timeout = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300);
    }, tier === "LOSS" ? 1500 : 3000);
    
    return () => clearTimeout(timeout);
  }, [payout, tier, onComplete]);

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(8px)",
    zIndex: 1000,
    opacity: visible ? 1 : 0,
    transition: "opacity 300ms ease",
    pointerEvents: visible ? "auto" : "none",
  };

  const cardStyle: React.CSSProperties = {
    padding: "40px 60px",
    borderRadius: 24,
    background: "linear-gradient(180deg, rgba(15,20,35,0.95) 0%, rgba(8,12,22,0.98) 100%)",
    border: `2px solid ${config.color}`,
    boxShadow: `0 0 60px ${config.glow}, 0 20px 60px rgba(0,0,0,0.6)`,
    textAlign: "center",
    transform: visible ? `scale(${config.scale})` : "scale(0.8)",
    transition: "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 42,
    fontWeight: 950,
    color: config.color,
    marginBottom: 20,
    textShadow: `0 0 30px ${config.glow}`,
    letterSpacing: 2,
  };

  const payoutStyle: React.CSSProperties = {
    fontSize: 32,
    fontWeight: 950,
    color: "#36D46B",
    marginBottom: 10,
  };

  const detailStyle: React.CSSProperties = {
    fontSize: 16,
    opacity: 0.75,
    color: "#EAF0FF",
  };

  return (
    <div style={overlayStyle} onClick={onComplete}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>{config.label}</div>
        
        {payout > 0 && (
          <>
            <div style={payoutStyle}>+${balanceRoll.toLocaleString()}</div>
            <div style={detailStyle}>{multiplier}x multiplier</div>
          </>
        )}
        
        {tier === "LOSS" && (
          <div style={{ ...detailStyle, marginTop: 10 }}>
            Better luck next time!
          </div>
        )}
      </div>
      
      {config.confetti && visible && <Confetti />}
    </div>
  );
}

function Confetti() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 2 + Math.random() * 2;
        
        const particleStyle: React.CSSProperties = {
          position: "absolute",
          left: `${left}%`,
          top: "-20px",
          width: "10px",
          height: "10px",
          background: ["#FFD700", "#FF6B35", "#4ECDC4", "#95E1D3"][Math.floor(Math.random() * 4)],
          borderRadius: "50%",
          animation: `fall ${duration}s linear ${delay}s infinite`,
        };
        
        return <div key={i} style={particleStyle} />;
      })}
      
      <style>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
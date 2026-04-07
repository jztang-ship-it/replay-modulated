/**
 * shared/components/PostHandSheet.tsx
 * Bottom sheet shown after a hand resolves — score, rank, near-miss hook, challenge.
 */

import { useEffect, useState } from "react";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

const TIER_COLORS: Record<string, string> = {
  GOAT: "#FFD700",
  MVP: "#FB923C",
  ALL_STAR: "#C084FC",
  STARTER: "#22C55E",
  ROOKIE: "#94A3B8",
  BUST: "#6B7280",
};

function formatTierLabel(tier: string): string {
  if (tier === "ALL_STAR") return "All-Star";
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

interface Props {
  totalFp: number;
  winTier: string;
  isBust: boolean;
  nearMissGap: number;
  nearMissNextTier: string | null;
  winPayout: number;
  currentUid: string;
  onPlayAgain: () => void;
  onViewLeaderboard: () => void;
}

export function PostHandSheet({
  totalFp, winTier, isBust, nearMissGap, nearMissNextTier,
  winPayout, currentUid, onPlayAgain, onViewLeaderboard,
}: Props) {
  const [challenge, setChallenge] = useState<{ nickname: string; score: number; metric: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("rm_challenge_target");
      if (raw) setChallenge(JSON.parse(raw));
    } catch { }
  }, []);

  function clearChallenge() {
    localStorage.removeItem("rm_challenge_target");
    setChallenge(null);
  }

  function formatChallengeScore(c: { score: number; metric: string }) {
    if (c.metric === "hand_best") return `${c.score.toFixed(1)} FP`;
    if (c.metric === "hand_avg") return `${c.score.toFixed(1)} FP avg`;
    return `${c.score.toLocaleString()} coins`;
  }

  const tierColor = TIER_COLORS[winTier] ?? "#6B7280";

  return (
    <>
      <style>{`
        @keyframes phsSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 79,
      }} />

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 80,
        background: "#0D1117",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px 16px 0 0",
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
        display: "flex", flexDirection: "column", gap: 12,
        animation: "phsSlideUp 350ms cubic-bezier(0.32, 0.72, 0, 1) both",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#EAF0FF",
      }}>
        {/* Row 1 — Score + tier */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: "#EAF0FF", fontFamily: FF }}>
            {totalFp.toFixed(1)} FP
          </span>
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
            color: tierColor,
            background: `${tierColor}18`,
            border: `1px solid ${tierColor}40`,
            borderRadius: 6, padding: "2px 8px",
          }}>
            {formatTierLabel(winTier)}
          </span>
        </div>

        {/* Near-miss hook — primary retention line, the most important thing on this sheet */}
        {nearMissGap > 0 && nearMissGap <= 8 && nearMissNextTier && (
          <div style={{ fontSize: 16, fontWeight: 800, color: "#FFB14A" }}>
            {nearMissGap.toFixed(1)} FP from {formatTierLabel(nearMissNextTier)}. One hand.
          </div>
        )}

        {/* Challenge target */}
        {challenge && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            <span>Chasing {challenge.nickname}: {formatChallengeScore(challenge)}</span>
            <span onClick={clearChallenge} style={{ cursor: "pointer", opacity: 0.6 }}>&times;</span>
          </div>
        )}

        {/* Primary CTA — single full-width PLAY AGAIN button */}
        <button
          onClick={onPlayAgain}
          style={{
            width: "100%", background: "#EAF0FF", color: "#070A12",
            fontWeight: 800, fontSize: 14, padding: "12px 0",
            borderRadius: 10, border: "none", cursor: "pointer",
            marginTop: 4,
          }}
        >
          PLAY AGAIN
        </button>

        {/* Subtle leaderboard link — accessible but never competing with PLAY AGAIN */}
        <div
          onClick={onViewLeaderboard}
          style={{
            fontSize: 12, color: "rgba(255,255,255,0.25)",
            textAlign: "center", cursor: "pointer", paddingTop: 8,
          }}
        >
          🏆 View Leaderboard
        </div>
      </div>
    </>
  );
}
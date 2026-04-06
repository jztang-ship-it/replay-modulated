/**
 * shared/components/ProfileScreen.tsx
 * Full-screen profile overlay — identity, ranks, personal bests.
 */

import { useEffect, useState } from "react";
import { getNickname, setNickname } from "@shared/utils/playerIdentity";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

type Entry = { uid: string; nickname: string; score: number };

const RANK_METRICS: { id: string; label: string }[] = [
  { id: "hand_best", label: "Best Hand" },
  { id: "hand_avg",  label: "Avg Score" },
  { id: "money_won", label: "Most Won" },
];

interface Props {
  currentUid: string;
  onClose: () => void;
}

export function ProfileScreen({ currentUid, onClose }: Props) {
  const [nickname, setNick] = useState(() => getNickname());
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(nickname);
  const [ranks, setRanks] = useState<Record<string, { rank: number | null; score: number | null }>>({});

  // Fetch ranks for all three metrics
  useEffect(() => {
    for (const m of RANK_METRICS) {
      fetch(`/api/leaderboard?metric=${m.id}&scope=daily&limit=50`)
        .then(r => r.json())
        .then(data => {
          const entries: Entry[] = data.entries ?? [];
          const idx = entries.findIndex(e => e.uid === currentUid);
          setRanks(prev => ({
            ...prev,
            [m.id]: idx >= 0 ? { rank: idx + 1, score: entries[idx].score } : { rank: null, score: null },
          }));
        })
        .catch(() => {
          setRanks(prev => ({ ...prev, [m.id]: { rank: null, score: null } }));
        });
    }
  }, [currentUid]);

  function handleSave() {
    const trimmed = editValue.trim();
    if (trimmed.length >= 2) {
      setNickname(trimmed);
      setNick(trimmed);
    }
    setEditing(false);
  }

  function formatScore(metricId: string, score: number): string {
    if (metricId === "hand_best") return `${score.toFixed(1)} FP`;
    if (metricId === "hand_avg") return `${(score / 10).toFixed(1)} avg`;
    return `${score.toLocaleString()} coins`;
  }

  // Personal bests from localStorage
  const bestHand = localStorage.getItem("rm_best_hand");
  const totalHands = localStorage.getItem("replaymod_hand_count");
  const bestTier = localStorage.getItem("rm_best_tier");

  // Check if nickname looks auto-generated
  const namePrompted = !!localStorage.getItem("replaymod_name_prompted");
  const looksAutoGen = /_.{4,}$/.test(nickname) || /\d{4,}/.test(nickname);
  const showNameBanner = namePrompted && looksAutoGen && !editing;

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 12,
    textAlign: "center",
    flex: 1,
    minWidth: 0,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 90,
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
      color: "#EAF0FF",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#EAF0FF", fontFamily: FF }}>
          PROFILE
        </span>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "5px 10px",
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: FF,
          }}
        >
          Done
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Section 1 — Identity card */}
        <div
          onClick={() => { if (!editing) { setEditValue(nickname); setEditing(true); } }}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 16,
            cursor: editing ? "default" : "pointer",
          }}
        >
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                maxLength={20}
                autoFocus
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#EAF0FF",
                  fontSize: 16,
                  fontWeight: 700,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8,
                    background: "#EAF0FF", color: "#070A12",
                    fontWeight: 800, fontSize: 13, border: "none", cursor: "pointer",
                  }}
                >
                  Save
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8,
                    background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)",
                    fontWeight: 700, fontSize: 13,
                    border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "rgba(255,215,0,0.15)",
                  border: "2px solid rgba(255,215,0,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 900, color: "#FFD700",
                  flexShrink: 0,
                }}>
                  {nickname.charAt(0).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#EAF0FF" }}>{nickname}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Tap to edit</span>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
                ID: {currentUid.slice(0, 8)}
              </div>
            </>
          )}
        </div>

        {/* Name banner */}
        {showNameBanner && (
          <div style={{
            background: "rgba(255,215,0,0.08)",
            border: "1px solid rgba(255,215,0,0.2)",
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              Set a real name to appear on the leaderboard
            </span>
            <button
              onClick={() => { setEditValue(nickname); setEditing(true); }}
              style={{
                background: "#FFD700", color: "#070A12",
                fontWeight: 800, fontSize: 11, border: "none",
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              }}
            >
              Set My Name
            </button>
          </div>
        )}

        {/* Section 2 — Today's standing */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            TODAY'S STANDING
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {RANK_METRICS.map(m => {
              const r = ranks[m.id];
              return (
                <div key={m.id} style={cardStyle}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{m.label}</div>
                  <div style={{
                    fontSize: 18, fontWeight: 900,
                    color: r?.rank != null && r.rank <= 10 ? "#FFD700" : "rgba(255,255,255,0.35)",
                    marginBottom: 2,
                  }}>
                    {r?.rank != null ? `#${r.rank}` : "\u2014"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                    {r?.score != null ? formatScore(m.id, r.score) : "\u2014"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3 — Personal bests */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            PERSONAL BESTS
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Best Hand</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: bestHand ? "#EAF0FF" : "rgba(255,255,255,0.35)" }}>
                {bestHand ? `${bestHand} FP` : "\u2014"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Hands Played</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: totalHands ? "#EAF0FF" : "rgba(255,255,255,0.35)" }}>
                {totalHands ?? "\u2014"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Best Tier</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: bestTier ? "#EAF0FF" : "rgba(255,255,255,0.35)" }}>
                {bestTier ? (bestTier === "ALL_STAR" ? "All-Star" : bestTier.charAt(0) + bestTier.slice(1).toLowerCase()) : "\u2014"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

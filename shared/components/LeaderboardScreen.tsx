/**
 * shared/components/LeaderboardScreen.tsx
 * Full-screen leaderboard overlay with new metrics.
 */

import { useEffect, useState, useCallback } from "react";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

type Metric = "hand_best" | "hand_avg" | "money_won";
type Scope = "daily" | "alltime";
type Entry = { uid: string; nickname: string; score: number };

const METRICS: { id: Metric; label: string }[] = [
  { id: "hand_best", label: "Best Hand" },
  { id: "hand_avg", label: "Avg Score" },
  { id: "money_won", label: "Most Won" },
];

function formatScore(metric: Metric, score: number): string {
  if (metric === "hand_best") return `${score.toFixed(1)} FP`;
  if (metric === "hand_avg") return `${score.toFixed(1)} FP avg`;
  return `${score.toLocaleString()} coins`;
}

function todayKey(metric: string) {
  return `rm_rankup_shown_${metric}_${new Date().toISOString().split("T")[0]}`;
}

interface Props {
  currentUid: string;
  onClose: () => void;
}

export function LeaderboardScreen({ currentUid, onClose }: Props) {
  const [metric, setMetric] = useState<Metric>("hand_best");
  const [scope, setScope] = useState<Scope>("daily");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showRankUp, setShowRankUp] = useState(false);
  const [rankUpInfo, setRankUpInfo] = useState<{ rank: number; label: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?metric=${metric}&scope=${scope}&limit=50`)
      .then(r => r.json())
      .then(data => {
        const all: Entry[] = data.entries ?? [];
        setEntries(all);

        // Check for rank-up into top 10
        const myIdx = all.findIndex(e => e.uid === currentUid);
        if (myIdx >= 0 && myIdx < 10 && scope === "daily") {
          const key = todayKey(metric);
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, "1");
            const label = METRICS.find(m => m.id === metric)?.label ?? metric;
            setRankUpInfo({ rank: myIdx + 1, label });
            setShowRankUp(true);
            setTimeout(() => setShowRankUp(false), 2500);
          }
        }
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [metric, scope, currentUid]);

  const handleChallenge = useCallback((e: Entry) => {
    localStorage.setItem("rm_challenge_target", JSON.stringify({
      nickname: e.nickname, score: e.score, metric,
    }));
    setToast(`Challenging ${e.nickname}`);
    setTimeout(() => setToast(null), 2000);
  }, [metric]);

  const top25 = entries.slice(0, 25);
  const myIdxInAll = entries.findIndex(e => e.uid === currentUid);
  const myEntryOutside = myIdxInAll >= 25 ? entries[myIdxInAll] : null;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: "pointer",
    background: active ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.05)",
    color: active ? "#FFD700" : "rgba(255,255,255,0.4)",
    border: active ? "1px solid rgba(255,215,0,0.3)" : "1px solid rgba(255,255,255,0.08)",
    transition: "all 0.2s",
  });

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
          LEADERBOARD
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

      {/* Metric tabs */}
      <div style={{ display: "flex", gap: 6, padding: "10px 16px 0" }}>
        {METRICS.map(m => (
          <div key={m.id} onClick={() => setMetric(m.id)} style={tabStyle(metric === m.id)}>
            {m.label}
          </div>
        ))}
      </div>

      {/* Scope toggle */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px 12px" }}>
        {(["daily", "alltime"] as Scope[]).map(s => (
          <div key={s} onClick={() => setScope(s)} style={tabStyle(scope === s)}>
            {s === "daily" ? "Today" : "All Time"}
          </div>
        ))}
      </div>

      {/* Entry list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} style={{
              height: 38, borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
            }} />
          ))
        ) : top25.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 24 }}>
            No entries yet — play a hand to get on the board
          </div>
        ) : (
          top25.map((e, i) => {
            const isMe = e.uid === currentUid;
            return (
              <div key={`${e.uid}-${i}`} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 6,
                background: isMe ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.03)",
                border: isMe ? "1px solid rgba(255,215,0,0.25)" : "1px solid transparent",
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 900,
                  color: i < 3 ? "#FFD700" : "rgba(255,255,255,0.35)",
                  minWidth: 20, textAlign: "right",
                }}>
                  {i + 1}.
                </span>
                <span style={{
                  flex: 1, fontSize: 12, fontWeight: isMe ? 800 : 600,
                  color: isMe ? "#FFD700" : "rgba(255,255,255,0.7)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {isMe && "YOU \u2192 "}{e.nickname}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 900,
                  color: isMe ? "#FFD700" : "#EAF0FF",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {formatScore(metric, e.score)}
                </span>
                {!isMe && (
                  <button
                    onClick={() => handleChallenge(e)}
                    style={{
                      fontSize: 9, padding: "2px 7px",
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 5,
                      color: "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                    }}
                  >
                    CHALLENGE
                  </button>
                )}
              </div>
            );
          })
        )}

        {/* User row if outside top 25 */}
        {myEntryOutside && (
          <div style={{
            position: "sticky", bottom: 0,
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 6,
            background: "rgba(255,215,0,0.08)",
            border: "1px solid rgba(255,215,0,0.25)",
            marginTop: 4,
          }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.35)", minWidth: 20, textAlign: "right" }}>
              {myIdxInAll + 1}.
            </span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: "#FFD700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              YOU &rarr; {myEntryOutside.nickname}
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: "#FFD700", fontVariantNumeric: "tabular-nums" }}>
              {formatScore(metric, myEntryOutside.score)}
            </span>
          </div>
        )}
      </div>

      {/* Footer count */}
      <div style={{ padding: "10px 16px 16px", textAlign: "center" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          {entries.length} players on the board today
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.85)", color: "#EAF0FF",
          padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          zIndex: 100, pointerEvents: "none",
        }}>
          {toast}
        </div>
      )}

      {/* Rank-up overlay */}
      {showRankUp && rankUpInfo && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12,
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M8 8h32v20c0 8-7.2 14-16 14S8 36 8 28V8z" fill="#FFD700" />
            <rect x="4" y="4" width="8" height="12" rx="2" fill="#FFD700" opacity="0.7" />
            <rect x="36" y="4" width="8" height="12" rx="2" fill="#FFD700" opacity="0.7" />
            <rect x="18" y="36" width="12" height="6" rx="1" fill="#FFD700" opacity="0.8" />
            <rect x="14" y="40" width="20" height="4" rx="1" fill="#FFD700" />
          </svg>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#EAF0FF" }}>
            You're in the top 10!
          </span>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
            #{rankUpInfo.rank} on {rankUpInfo.label} today
          </span>
        </div>
      )}
    </div>
  );
}
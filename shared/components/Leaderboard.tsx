/**
 * shared/components/Leaderboard.tsx — Tab-based leaderboard display.
 * Fetches from /api/leaderboard. Highlights current player.
 */

import { useEffect, useState } from "react";

type Metric = "streak" | "wins" | "fp";
type Scope = "daily" | "alltime";
type Entry = { uid: string; nickname: string; score: number };

const METRICS: { id: Metric; label: string }[] = [
  { id: "streak", label: "Streak" },
  { id: "wins",   label: "Wins" },
  { id: "fp",     label: "Best FP" },
];

interface Props {
  currentUid: string;
  sport: "basketball" | "baseball" | "worldcup";
}

export function Leaderboard({ currentUid, sport }: Props) {
  const [metric, setMetric] = useState<Metric>("streak");
  const [scope, setScope]   = useState<Scope>("daily");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/leaderboard?sport=${sport}&metric=${metric}&scope=${scope}&limit=20`)
      .then(r => r.json())
      .then(data => setEntries(data.entries ?? []))
      .catch(() => { setEntries([]); setError(true); })
      .finally(() => setLoading(false));
  }, [metric, scope, sport]);

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
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
        Leaderboard
      </div>

      {/* Metric tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {METRICS.map(m => (
          <div key={m.id} onClick={() => setMetric(m.id)} style={tabStyle(metric === m.id)}>
            {m.label}
          </div>
        ))}
      </div>

      {/* Scope toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["daily", "alltime"] as Scope[]).map(s => (
          <div key={s} onClick={() => setScope(s)} style={tabStyle(scope === s)}>
            {s === "daily" ? "Today" : "All Time"}
          </div>
        ))}
      </div>

      {/* Entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {loading ? (
          // Skeleton
          [1, 2, 3].map(i => (
            <div key={i} style={{
              height: 32, borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))
        ) : error ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 16 }}>
            Leaderboard temporarily unavailable
          </div>
        ) : entries.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 16 }}>
            No entries yet — play a hand to get on the board
          </div>
        ) : (
          entries.map((e, i) => {
            const isMe = e.uid === currentUid;
            return (
              <div key={`${e.uid}-${i}`} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 6,
                background: isMe ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.03)",
                border: isMe ? "1px solid rgba(255,215,0,0.25)" : "1px solid transparent",
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 900, color: i < 3 ? "#FFD700" : "rgba(255,255,255,0.35)",
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
                  {metric === "fp" ? e.score.toFixed(1) : e.score}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

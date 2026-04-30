/**
 * shared/components/LeaderboardScreen.tsx
 * Side-by-side leaderboard: Best Hand (40%) | Session Score (60%)
 * Pool header with running value, your rank + gap at bottom.
 */

import { useEffect, useState, useCallback, useMemo } from "react";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

type Entry = { uid: string; nickname: string; score: number; session_id?: string | null };

/** Pool distribution percentages for top 10 per lane. */
const POOL_PCT = [35, 20, 12, 8, 6, 5, 4, 4, 3, 3];

interface Props {
  currentUid: string;
  sport: "basketball" | "baseball" | "worldcup";
  onClose: () => void;
}

function isMe(e: Entry, uid: string, sessId: string | null): boolean {
  if (uid && e.uid === uid) return true;
  if (sessId && e.session_id && e.session_id === sessId) return true;
  return false;
}

function EntryRow({ e, rank, me, poolPct }: { e: Entry; rank: number; me: boolean; poolPct?: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "4px 6px", borderRadius: 5,
      background: me ? "rgba(255,215,0,0.10)" : "transparent",
      borderLeft: me ? "2px solid #FFD700" : "2px solid transparent",
    }}>
      <span style={{
        fontSize: 10, fontWeight: 900,
        color: rank <= 3 ? "#FFD700" : "rgba(255,255,255,0.3)",
        minWidth: 16, textAlign: "right",
      }}>{rank}</span>
      <span style={{
        flex: 1, fontSize: 11, fontWeight: me ? 800 : 600,
        color: me ? "#FFD700" : "rgba(255,255,255,0.65)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{me ? "YOU" : e.nickname}</span>
      <span style={{
        fontSize: 11, fontWeight: 900,
        color: me ? "#FFD700" : "#EAF0FF",
        fontVariantNumeric: "tabular-nums",
      }}>{e.score >= 1000 ? `${(e.score / 1000).toFixed(1)}k` : e.score.toFixed(1)}</span>
      {poolPct != null && (
        <span style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,215,0,0.45)", minWidth: 18, textAlign: "right" }}>{poolPct}%</span>
      )}
    </div>
  );
}

export function LeaderboardScreen({ currentUid, sport, onClose }: Props) {
  const [bestEntries, setBestEntries] = useState<Entry[]>([]);
  const [sessionEntries, setSessionEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolValue, setPoolValue] = useState(1000);

  const sessId = typeof localStorage !== "undefined" ? localStorage.getItem("rm_session_id") : null;

  // Fetch both lanes + pool in parallel
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/leaderboard?sport=${sport}&metric=hand_best&scope=daily&limit=10`).then(r => r.json()).catch(() => ({ entries: [] })),
      fetch(`/api/leaderboard?sport=${sport}&metric=session_score&scope=daily&limit=10`).then(r => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/bonus-pool?action=get").then(r => r.json()).catch(() => ({ pool: 1000 })),
    ]).then(([best, session, pool]) => {
      setBestEntries(best.entries ?? []);
      setSessionEntries(session.entries ?? []);
      setPoolValue(pool.pool ?? 1000);
    }).finally(() => setLoading(false));
  }, [sport]);

  // Pool drip
  useEffect(() => {
    const id = setInterval(() => setPoolValue(p => parseFloat((p + 0.07).toFixed(2))), 3000);
    return () => clearInterval(id);
  }, []);

  const bestPool = Math.round(poolValue * 0.40);
  const sessionPool = Math.round(poolValue * 0.60);

  // Find user's best rank across both lanes
  const myBestIdx = bestEntries.findIndex(e => isMe(e, currentUid, sessId));
  const mySessionIdx = sessionEntries.findIndex(e => isMe(e, currentUid, sessId));
  // rm_best_hand is sport-scoped (basketball: raw, baseball: baseball_rm_best_hand).
  const bestHandKey = sport === "basketball" ? "rm_best_hand" : `${sport}_rm_best_hand`;
  const myBestScore = myBestIdx >= 0 ? bestEntries[myBestIdx].score : parseFloat(localStorage.getItem(bestHandKey) ?? "0");
  const gapToBest10 = bestEntries.length >= 10 && myBestIdx < 0
    ? (bestEntries[9].score - myBestScore).toFixed(1)
    : null;

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
        padding: "14px 16px 8px",
      }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: "#EAF0FF", fontFamily: FF, letterSpacing: 1 }}>
          DAILY LEADERBOARD
        </span>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8, padding: "5px 10px", color: "rgba(255,255,255,0.5)",
          fontSize: 12, cursor: "pointer",
        }}>Done</button>
      </div>

      {/* Pool header */}
      <div style={{
        margin: "0 16px 10px", padding: "10px 14px", borderRadius: 12,
        background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,215,0,0.5)", textTransform: "uppercase", marginBottom: 4 }}>
          Daily Bonus Pool
        </div>
        <div style={{ fontSize: 22, fontWeight: 950, color: "#FFD700", fontVariantNumeric: "tabular-nums", textShadow: "0 0 12px rgba(255,215,0,0.4)" }}>
          ${poolValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
          Top 10 in each lane split the pool daily
        </div>
      </div>

      {/* Side-by-side lanes */}
      <div style={{ flex: 1, display: "flex", gap: 8, padding: "0 12px", overflow: "hidden" }}>
        {/* Best Hand — 40% */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "0 4px 6px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#FFD700", letterSpacing: 0.5 }}>
              Best Hand
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              Highest single hand · ${bestPool} pool
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {loading ? (
              [1,2,3].map(i => <div key={i} style={{ height: 28, borderRadius: 5, background: "rgba(255,255,255,0.03)" }} />)
            ) : bestEntries.length === 0 ? (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: 16 }}>No entries yet</div>
            ) : (
              bestEntries.slice(0, 10).map((e, i) => (
                <EntryRow key={`b-${i}`} e={e} rank={i + 1} me={isMe(e, currentUid, sessId)} poolPct={POOL_PCT[i]} />
              ))
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

        {/* Session Score — 60% */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "0 4px 6px" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#FFD700", letterSpacing: 0.5 }}>
              Session Score
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              Total FP today (non-bust) · ${sessionPool} pool
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {loading ? (
              [1,2,3].map(i => <div key={i} style={{ height: 28, borderRadius: 5, background: "rgba(255,255,255,0.03)" }} />)
            ) : sessionEntries.length === 0 ? (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: 16 }}>No entries yet</div>
            ) : (
              sessionEntries.slice(0, 10).map((e, i) => (
                <EntryRow key={`s-${i}`} e={e} rank={i + 1} me={isMe(e, currentUid, sessId)} poolPct={POOL_PCT[i]} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Your position summary */}
      <div style={{
        padding: "10px 16px 16px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>
              Your Best Hand
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: myBestIdx >= 0 && myBestIdx < 10 ? "#FFD700" : "#EAF0FF" }}>
              {myBestScore > 0 ? `${myBestScore.toFixed(1)} FP` : "—"}
              {myBestIdx >= 0 && <span style={{ fontSize: 10, color: "#FFD700", marginLeft: 6 }}>#{myBestIdx + 1}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {gapToBest10 && Number(gapToBest10) > 0 ? (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                {gapToBest10} FP from top 10
              </div>
            ) : myBestIdx >= 0 && myBestIdx < 10 ? (
              <div style={{ fontSize: 10, color: "#FFD700" }}>
                You're on the board!
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                Play a hand to compete
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

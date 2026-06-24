/**
 * shared/components/BossScreen.tsx
 *
 * Full-screen overlay opened by the GameBar trophy (solo play). Two sections:
 *   (a) BOSS ENTRY — the reused BossEntryCta ("Fight Today's Boss" → the
 *       existing /{sport}/challenge/{id} open path → boss play; no fork).
 *   (b) TODAY'S BOSS LEADERBOARD — Delta-C: best-score-per-user for today's
 *       boss, from GET /api/leaderboard?board=boss. NO bonus-pool UI (no pool
 *       header, no $X sublines, no poolPct column).
 *
 * Shell modelled on LeaderboardScreen (fixed overlay + Done + skeleton), but
 * a SEPARATE component — LeaderboardScreen is left untouched (Option A: its
 * Collect / post-hand openers still point at it). The row is inlined here so
 * we don't export/refactor LeaderboardScreen's local EntryRow.
 *
 * Boss must never be a dead end: when no boss resolves (bossChallengeId null),
 * the screen still opens with a graceful "no boss today" state.
 */
import { useEffect, useState, useCallback } from "react";
import { BossEntryCta } from "./BossEntryCta";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

type Entry = { uid: string; nickname: string; score: number; session_id?: string | null };

interface Props {
  sport: "basketball" | "baseball" | "football";
  currentUid: string;
  bossChallengeId: string | null;
  bossPlayerCount: number | null;
  onClose: () => void;
}

function isMe(e: Entry, uid: string, sessId: string | null): boolean {
  if (uid && e.uid === uid) return true;
  if (sessId && e.session_id && e.session_id === sessId) return true;
  return false;
}

function BossEntryRow({ e, rank, me }: { e: Entry; rank: number; me: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 8px", borderRadius: 6,
      background: me ? "rgba(255,177,74,0.12)" : "transparent",
      borderLeft: me ? "2px solid #FFB14A" : "2px solid transparent",
    }}>
      <span style={{
        fontSize: 11, fontWeight: 900,
        color: rank <= 3 ? "#FFB14A" : "rgba(255,255,255,0.3)",
        minWidth: 18, textAlign: "right",
      }}>{rank}</span>
      <span style={{
        flex: 1, fontSize: 12, fontWeight: me ? 800 : 600,
        color: me ? "#FFB14A" : "rgba(255,255,255,0.7)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{me ? "YOU" : e.nickname}</span>
      <span style={{
        fontSize: 12, fontWeight: 900,
        color: me ? "#FFB14A" : "#EAF0FF",
        fontVariantNumeric: "tabular-nums",
      }}>{e.score.toFixed(1)}</span>
    </div>
  );
}

export function BossScreen({ sport, currentUid, bossChallengeId, bossPlayerCount, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sessId = typeof localStorage !== "undefined" ? localStorage.getItem("rm_session_id") : null;

  useEffect(() => {
    fetch(`/api/leaderboard?sport=${sport}&board=boss&limit=20`)
      .then(r => r.json())
      .catch(() => ({ entries: [] }))
      .then((d) => { setEntries(d.entries ?? []); setLoaded(true); });
  }, [sport]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape.
  const handleClose = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const myIdx = entries.findIndex(e => isMe(e, currentUid, sessId));

  return (
    <div
      data-testid="boss-screen"
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px 8px",
      }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: "#FFB14A", fontFamily: FF, letterSpacing: 1 }}>
          TODAY'S BOSS
        </span>
        <button onClick={handleClose} style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8, padding: "5px 10px", color: "rgba(255,255,255,0.5)",
          fontSize: 12, cursor: "pointer",
        }}>Done</button>
      </div>

      {/* Boss entry (reused). Null boss → graceful empty state, never a dead end. */}
      <div style={{ padding: "0 16px" }}>
        {bossChallengeId ? (
          <BossEntryCta sport={sport} bossChallengeId={bossChallengeId} bossPlayerCount={bossPlayerCount} />
        ) : (
          <div style={{
            margin: "12px 0 4px", padding: "16px", borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)",
            textAlign: "center", fontSize: 13, fontWeight: 700, color: "rgba(234,240,255,0.7)",
          }}>
            No boss today — check back tomorrow.
          </div>
        )}
      </div>

      {/* Today's boss leaderboard — best score per user. No bonus-pool UI. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 16px 0", overflow: "hidden" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#FFB14A", letterSpacing: 0.5, padding: "0 4px 6px" }}>
          Boss Leaderboard
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {!loaded ? (
            [1, 2, 3].map(i => <div key={i} style={{ height: 30, borderRadius: 6, background: "rgba(255,255,255,0.03)" }} />)
          ) : entries.length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", padding: "8px 4px" }}>
              Be the first to challenge today's boss.
            </div>
          ) : (
            entries.slice(0, 20).map((e, i) => (
              <BossEntryRow key={`boss-${i}`} e={e} rank={i + 1} me={isMe(e, currentUid, sessId)} />
            ))
          )}
        </div>
      </div>

      {/* Your position summary */}
      <div style={{ padding: "10px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {myIdx >= 0 ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: "#FFB14A" }}>
            You're #{myIdx + 1} on today's boss — {entries[myIdx].score.toFixed(1)}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {bossChallengeId ? "Beat the boss to land on the board." : "No boss live right now."}
          </div>
        )}
      </div>
    </div>
  );
}

// shared/components/ChallengeDebugPanel.tsx
//
// Dev-mode QA overlay. Renders only when `?debug=1` is in the URL — see
// the gate in GameView before this component mounts. Surfaces the
// challenge stats, user identity, and last API response so QA can verify
// replay-policy enforcement without digging into Supabase.
//
// Intentionally minimal: no charts, no graphs, no styled tables. Just the
// raw numbers in a tight monospace block.

import { useCallback, useEffect, useState } from "react";
import { isRealName } from "@shared/utils/isRealName";
import { hasAttemptedChallenge } from "@shared/hooks/useChallengeShare";

interface Props {
  /** Active challenge ID — when undefined the "Current Challenge" section
   *  is replaced with a stub. */
  challengeId?: string;
  /** Current player UID (Supabase user.id when signed in, else the local
   *  rm_uid). Truncated for display. */
  userId?: string;
  /** Current nickname (real or auto-generated). */
  userName: string;
}

interface ChallengeStats {
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
}

interface ApiLog {
  endpoint: string;
  status: number;
  ms: number;
  ts: number;
}

export function ChallengeDebugPanel({ challengeId: challengeIdFromProps, userId, userName }: Props) {
  // Local override so QA can paste an arbitrary challenge id and refetch.
  // Falls through to the prop-resolved id when the input is blank.
  const [manualId, setManualId] = useState("");
  const challengeId = manualId.trim() || challengeIdFromProps;

  const [stats, setStats] = useState<ChallengeStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [lastApi, setLastApi] = useState<ApiLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!challengeId) { setStats(null); setStatsError("No challenge id in scope. Paste one below to fetch."); return; }
    setRefreshing(true);
    setStatsError(null);
    const t0 = performance.now();
    const endpoint = `/api/challenge/${challengeId}`;
    try {
      const r = await fetch(endpoint);
      const ms = Math.round(performance.now() - t0);
      setLastApi({ endpoint, status: r.status, ms, ts: Date.now() });
      if (!r.ok) {
        setStatsError(`HTTP ${r.status}`);
        setStats(null);
      } else {
        const d = await r.json();
        setStats({
          attempt_count: Number(d.attempt_count ?? 0),
          winner_count: Number(d.winner_count ?? 0),
          best_score: d.best_score ?? null,
          best_user_name: d.best_user_name ?? null,
        });
      }
    } catch (e: any) {
      const ms = Math.round(performance.now() - t0);
      setLastApi({ endpoint, status: 0, ms, ts: Date.now() });
      setStatsError(e?.message ? String(e.message) : "fetch failed");
    } finally {
      setRefreshing(false);
    }
  }, [challengeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const isPractice = challengeId ? hasAttemptedChallenge(challengeId) : false;
  const realName = isRealName(userName);
  const uidShort = userId ? `${userId.slice(0, 8)}…` : "none";
  const chShort = challengeId ? `${challengeId.slice(0, 8)}…` : "none";

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, lineHeight: 1.35 }}>
      <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ color: "#EAF0FF", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
    </div>
  );

  const sectionHeader = (text: string) => (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
      color: "rgba(255,177,74,0.85)", marginTop: 8, marginBottom: 2,
    }}>{text}</div>
  );

  return (
    <div style={{
      // Top-left, NOT bottom — the basketball app shell renders a
      // green diagnostic bar at bottom:0 / zIndex:100000 in debug mode,
      // and the post-result challenge action bar also lives bottom-
      // fixed when a challenge sheet is dismissed. Either would occlude
      // a bottom-anchored panel. Top-left is unambiguously visible.
      position: "fixed", top: "calc(12px + env(safe-area-inset-top, 0px))", left: 12, zIndex: 200000,
      width: 280, maxWidth: "calc(100vw - 24px)",
      background: "rgba(7,10,18,0.94)",
      border: "1px solid rgba(255,177,74,0.55)",
      borderRadius: 8,
      padding: "8px 10px 10px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 11,
      color: "#EAF0FF",
      pointerEvents: "auto",
      boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#FFB14A" }}>DEBUG</span>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4, padding: "1px 6px",
            color: "rgba(255,255,255,0.7)", fontSize: 11,
            cursor: refreshing ? "default" : "pointer",
            fontFamily: "inherit",
          }}
          title="Refetch GET /api/challenge/:id"
        >↻{refreshing ? " …" : ""}</button>
      </div>

      {/* Manual challenge-id override — paste a uuid to query a specific
          challenge without leaving the current route. Clearing the field
          falls back to the prop-resolved id (ctx → URL → localStorage). */}
      <input
        type="text"
        value={manualId}
        onChange={(e) => setManualId(e.target.value)}
        placeholder={challengeIdFromProps ? `using ${challengeIdFromProps.slice(0, 8)}…` : "paste challenge_id (uuid)"}
        spellCheck={false}
        autoComplete="off"
        style={{
          width: "100%", marginTop: 6, marginBottom: 2,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 4, padding: "3px 6px",
          color: "#EAF0FF", fontSize: 10,
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />

      {/* Always render the section so QA can see what resolved (or didn't).
          When no challenge id is in scope, show a hint pointing at the
          manual input above instead of hiding everything — the previous
          gate left the panel feeling empty on the bare /basketball/?debug=1
          route where no challengeCtx + no URL slug + no localStorage
          markers means the auto-resolve chain returns undefined. */}
      {sectionHeader("Current Challenge")}
      {challengeId ? (
        <>
          {row("challenge_id", chShort)}
          {statsError && row("error", <span style={{ color: "#FCA5A5" }}>{statsError}</span>)}
          {stats && (
            <>
              {row("attempt_count", stats.attempt_count)}
              {row("winner_count", stats.winner_count)}
              {row("best_score", stats.best_score == null ? "—" : `${stats.best_score} (${stats.best_user_name ?? "?"})`)}
            </>
          )}
          {refreshing && !stats && row("status", <span style={{ color: "rgba(255,255,255,0.55)" }}>fetching…</span>)}
          {row("is_practice (you)", String(isPractice))}
        </>
      ) : (
        row("status", <span style={{ color: "rgba(255,255,255,0.55)" }}>no id in scope — paste above</span>)
      )}

      {sectionHeader("Current User")}
      {row("user_name", userName || "anonymous")}
      {row("user_id", uidShort)}
      {row("isRealName()", String(realName))}

      {sectionHeader("Last API Response")}
      {lastApi ? (
        <>
          {row("endpoint", lastApi.endpoint.replace(/\/[0-9a-f-]{36}$/, "/<id>"))}
          {row("status", lastApi.status || "—")}
          {row("ms", lastApi.ms)}
        </>
      ) : (
        row("status", "—")
      )}
    </div>
  );
}

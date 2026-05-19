// shared/components/YourChallengesPanel.tsx
import { useEffect, useState } from "react";
import { supabase } from "@shared/lib/supabase";
import { track } from "@shared/analytics/analytics";

const LAST_VIEWED_KEY = "rm_challenges_last_viewed";

interface ChallengeRow {
  challenge_id: string;
  sport: string;
  target_fp: number;
  challenger_name: string | null;
  trigger_type: string;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
  last_attempt_at: string | null;
  created_at: string;
}

function statsLine(row: ChallengeRow): string {
  const { attempt_count, winner_count, best_score, best_user_name } = row;
  if (attempt_count === 0) return "No attempts yet";
  if (winner_count === 0) return `${attempt_count} attempt${attempt_count > 1 ? "s" : ""} · unbeaten`;
  return `${attempt_count} attempts · best ${best_score?.toFixed(1) ?? "?"} FP by ${best_user_name ?? "?"}`;
}

interface Props {
  sport: string;
  currentUid: string | null;
}

export function YourChallengesPanel({ sport, currentUid }: Props) {
  const [rows, setRows] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!currentUid) { setLoading(false); return; }
    const lastViewed = localStorage.getItem(LAST_VIEWED_KEY) ?? "1970-01-01";

    supabase
      .from("shared_challenges")
      .select("challenge_id,sport,target_fp,challenger_name,trigger_type,attempt_count,winner_count,best_score,best_user_name,last_attempt_at,created_at")
      .eq("created_by", currentUid)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const challenges = (data ?? []) as ChallengeRow[];
        setRows(challenges);
        const anyNew = challenges.some(c => c.last_attempt_at && c.last_attempt_at > lastViewed);
        setHasNew(anyNew);
        setLoading(false);
        localStorage.setItem(LAST_VIEWED_KEY, new Date().toISOString());
        if (anyNew) track("challenges", "challenge_unbeaten_viewed", { sport });
        track("challenges", "challenge_stats_seen", { sport, count: challenges.length });
      });
  }, [currentUid, sport]); // eslint-disable-line

  if (loading) return <div style={{ padding: 24, opacity: 0.5, textAlign: "center" }}>Loading…</div>;
  if (!currentUid) return (
    <div style={{ padding: 24, opacity: 0.5, textAlign: "center" }}>Sign in to see your challenges.</div>
  );
  if (rows.length === 0) return (
    <div style={{ padding: 24, opacity: 0.5, textAlign: "center", lineHeight: 1.6 }}>
      No challenges yet.<br />
      <span style={{ fontSize: 12 }}>After a hand ends, tap "Challenge a Friend" to start one.</span>
    </div>
  );

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      {hasNew && (
        <div style={{
          fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
          color: "#FFB14A", marginBottom: 14,
        }}>New attempts since you last checked</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(row => {
          const isUnbeaten = row.attempt_count > 0 && row.winner_count === 0;
          return (
            <div
              key={row.challenge_id}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: isUnbeaten ? "1.5px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#FFB14A", fontStyle: "italic" }}>
                  {Number(row.target_fp).toFixed(1)} FP
                </div>
                {isUnbeaten && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                    color: "#22C55E", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 4,
                    padding: "2px 6px",
                  }}>Unbeaten</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{statsLine(row)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/${row.sport}/challenge/${row.challenge_id}`).then(() => {})}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                    background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >Copy link</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Returns true if there are unseen challenge attempts (for badge dot in profile header) */
export function useHasNewChallengeAttempts(currentUid: string | null, sport: string): boolean {
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    if (!currentUid) return;
    const lastViewed = localStorage.getItem(LAST_VIEWED_KEY) ?? "1970-01-01";
    supabase
      .from("shared_challenges")
      .select("last_attempt_at")
      .eq("created_by", currentUid)
      .not("last_attempt_at", "is", null)
      .gt("last_attempt_at", lastViewed)
      .limit(1)
      .then(({ data }) => setHasNew((data?.length ?? 0) > 0));
  }, [currentUid, sport]); // eslint-disable-line
  return hasNew;
}

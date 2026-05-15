// shared/components/ChallengeLandingScreen.tsx
import { useEffect, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types/index";
import { track } from "@shared/analytics/analytics";
import { hasAttemptedChallenge } from "@shared/hooks/useChallengeShare";
import { isRealName } from "@shared/utils/isRealName";

interface ChallengeData {
  challenge_id: string;
  challenger_name: string;
  target_score: number;
  sport: string;
  season: string;
  trigger_type: string;
  share_headline: string;
  initial_roster: Record<string, unknown>;
  roster_size: number;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
}

interface Props {
  challengeId: string;
  sport: string;
  deserializeRoster: (snapshot: Record<string, unknown>) => GeneratedCard[];
  validateRosterSnapshot: (snapshot: Record<string, unknown>) => boolean;
  onAccept: (ctx: ChallengeCtx) => void;
  onClose: () => void;
}

function challengeStatsLine(data: ChallengeData): string | null {
  const { attempt_count, winner_count, best_score, best_user_name } = data;
  // Zero attempts: omit the line entirely — the invitation's job is to make
  // the recipient tap Accept, not push generic "be the first" copy.
  if (attempt_count === 0) return null;
  if (attempt_count === 1 && winner_count === 0) return "1 attempt · still unbeaten";
  if (attempt_count >= 2 && winner_count === 0) return `Unbeaten so far · ${attempt_count} attempts`;
  const failedCount = attempt_count - winner_count;
  const failureRate = Math.round((failedCount / attempt_count) * 100);
  if (attempt_count >= 3 && winner_count > 0) return `${attempt_count} attempts · ${failureRate}% failed`;
  return `${attempt_count} attempts · best ${best_score?.toFixed(1) ?? "?"} FP by ${best_user_name ?? "someone"}`;
}

const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

export function ChallengeLandingScreen({ challengeId, sport, deserializeRoster, validateRosterSnapshot, onAccept, onClose }: Props) {
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);

  useEffect(() => {
    track("challenges", "challenge_link_open", { challenge_id: challengeId, sport });
    setAlreadyAttempted(hasAttemptedChallenge(challengeId));
    fetch(`/api/challenge/${challengeId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Challenge not found."); setLoading(false); });
  }, [challengeId, sport]);

  function handleAccept() {
    if (!data) return;
    if (!validateRosterSnapshot(data.initial_roster)) {
      setError("Invalid challenge data. It may have expired.");
      return;
    }
    const initialRoster = deserializeRoster(data.initial_roster);
    track("challenges", "challenge_accept", { challenge_id: challengeId, sport });
    track("challenges", "challenge_attempt_start", { challenge_id: challengeId, sport });
    onAccept({
      challengeId: data.challenge_id,
      initialRoster,
      targetScore: data.target_score,
      challengerName: data.challenger_name,
      sport: data.sport,
      season: data.season,
    });
  }

  const cards: any[] = (data?.initial_roster as any)?.cards ?? [];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", overflowY: "auto",
      padding: "24px 20px 40px",
    }}>
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          alignSelf: "flex-start", background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          padding: "5px 12px", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer",
          marginBottom: 24,
        }}
      >← Back</button>

      {loading && <div style={{ textAlign: "center", opacity: 0.5, marginTop: 80 }}>Loading challenge…</div>}
      {error && <div style={{ textAlign: "center", color: "#EF4444", marginTop: 80 }}>{error}</div>}

      {data && (() => {
        const namedChallenger = isRealName(data.challenger_name);
        const statsLine = challengeStatsLine(data);
        return (
        <>
          {/* Hierarchy (top → bottom):
              1. Big-game / season-reel caption (em-dashed italic) — leads
              2. Score callout: target FP "on this hand."
              3. Sub-question: "Think you can beat it?"
              4. Card spread
              5. Accept Challenge
              6. (optional) tiny stats line and "from {name}" attribution */}

          {data.share_headline && (
            <div style={{
              fontSize: 22, fontStyle: "italic", fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.35, marginBottom: 22, maxWidth: 540,
            }}>
              — {data.share_headline}
            </div>
          )}

          {/* Score callout */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 68, fontWeight: 950, color: "#FFB14A", lineHeight: 1, fontStyle: "italic" }}>
              {data.target_score.toFixed(1)}
            </span>
            <span style={{ fontSize: 22, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>FP</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>
            on this hand.
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#EAF0FF", marginBottom: 22 }}>
            Think you can beat it?
          </div>

          {/* Card spread */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24, justifyContent: "center" }}>
            {cards.map((card: any, i: number) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.04)", border: `1.5px solid ${TIER_ACCENT[card.tier] ?? "#9CA3AF"}`,
                borderRadius: 10, padding: "10px 14px", minWidth: 120, textAlign: "center",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: TIER_ACCENT[card.tier] ?? "#9CA3AF", textTransform: "uppercase", marginBottom: 4 }}>{card.tier}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#EAF0FF" }}>{card.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{card.team} · ${card.salary}</div>
              </div>
            ))}
          </div>

          {/* Accept CTA */}
          {alreadyAttempted ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 12 }}>
              You've already attempted this challenge.
            </div>
          ) : (
            <button
              onClick={handleAccept}
              style={{
                width: "100%", padding: "16px", borderRadius: 14,
                background: "#FFB14A", border: "none",
                color: "#070A12", fontSize: 17, fontWeight: 900, cursor: "pointer",
                marginBottom: 10,
              }}
            >Accept Challenge</button>
          )}

          {/* Small attribution + (optional) stats — minor below the CTA. */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
            {namedChallenger && <span>from {data.challenger_name}</span>}
            {namedChallenger && statsLine && <span> · </span>}
            {statsLine && <span>{statsLine}</span>}
          </div>
        </>
        );
      })()}
    </div>
  );
}

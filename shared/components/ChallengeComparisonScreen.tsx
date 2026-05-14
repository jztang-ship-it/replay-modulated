// shared/components/ChallengeComparisonScreen.tsx
import { useEffect, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { track } from "@shared/analytics/analytics";

interface AttemptResult {
  attempt_id: string;
  is_best: boolean;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
  already_attempted?: boolean;
}

interface Props {
  challengeCtx: ChallengeCtx;
  myScore: number;
  myWinTier: string;
  sport: string;
  onSendItBack: () => void;
  onPlayFresh: () => void;
}

function challengeStatsLine(count: number, winners: number, best: number | null, bestName: string | null): string {
  if (count === 0) return "Be the first to try.";
  if (count === 1 && winners === 0) return "1 attempt · still unbeaten";
  if (count >= 2 && winners === 0) return `Unbeaten so far · ${count} attempts`;
  const failed = count - winners;
  const rate = Math.round((failed / count) * 100);
  if (count >= 3 && winners > 0) return `${count} attempts · ${rate}% failed`;
  return `${count} attempts · best ${best?.toFixed(1) ?? "?"} FP by ${bestName ?? "someone"}`;
}

export function ChallengeComparisonScreen({ challengeCtx, myScore, myWinTier, sport, onSendItBack, onPlayFresh }: Props) {
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(true);
  const isNewUser = typeof window !== "undefined" && localStorage.getItem(`replaymod_ftue_${sport}`) !== "1";

  const isWinner = myScore > challengeCtx.targetScore;

  // Primary/secondary CTA labels — derived from (new vs existing) × (won vs lost)
  const ctas = (() => {
    if (isWinner) {
      // Won: both new and existing → Send It Back primary, Play Fresh secondary
      return {
        primaryLabel: "Send It Back",
        primaryAction: onSendItBack,
        secondaryLabel: "Play a Fresh Hand",
        secondaryAction: onPlayFresh,
      };
    }
    // Lost
    if (isNewUser) {
      return {
        primaryLabel: "Try a Fresh Hand",
        primaryAction: onPlayFresh,
        secondaryLabel: "Send It Back Anyway",
        secondaryAction: onSendItBack,
      };
    }
    return {
      primaryLabel: "Make Them Prove It Again",
      primaryAction: onSendItBack,
      secondaryLabel: "Play a Fresh Hand",
      secondaryAction: onPlayFresh,
    };
  })();

  useEffect(() => {
    const uid = getPlayerUid();
    const name = getNickname() || "Anonymous";
    markChallengeAttempted(challengeCtx.challengeId);

    fetch(`/api/challenge/${challengeCtx.challengeId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: myScore,
        is_winner: isWinner,
        user_id: uid || undefined,
        user_name: name,
      }),
    })
      .then(r => r.json())
      .then((d: AttemptResult) => {
        setAttemptResult(d);
        setSubmitting(false);
        track("challenges", isWinner ? "challenge_win" : "challenge_loss", {
          challenge_id: challengeCtx.challengeId,
          sport,
          score_delta: Math.round((myScore - challengeCtx.targetScore) * 10) / 10,
          attempt_count: d.attempt_count,
        });
        track("challenges", "challenge_attempt_complete", {
          challenge_id: challengeCtx.challengeId, sport,
          is_winner: isWinner, score: myScore,
        });
      })
      .catch(() => setSubmitting(false));
  }, []); // eslint-disable-line

  const isBest = attemptResult?.is_best ?? false;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9500,
      background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px 24px 48px", overflowY: "auto",
    }}>
      {/* Result headline */}
      <div style={{ fontSize: 40, fontWeight: 950, color: isWinner ? "#22C55E" : "#EF4444", marginBottom: 8 }}>
        {isWinner ? "You Beat It!" : "They Hold."}
      </div>
      {isBest && (
        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
          color: "#FFB14A", border: "1px solid rgba(255,177,74,0.4)", borderRadius: 6, padding: "3px 10px",
          marginBottom: 16,
        }}>New Best Score</div>
      )}

      {/* Score comparison */}
      <div style={{
        display: "flex", gap: 24, marginBottom: 32, marginTop: 16,
        background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "20px 32px",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>You</div>
          <div style={{ fontSize: 48, fontWeight: 950, color: isWinner ? "#22C55E" : "#EAF0FF", fontStyle: "italic" }}>{myScore.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>FP</div>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.12)", alignSelf: "stretch" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>{challengeCtx.challengerName}</div>
          <div style={{ fontSize: 48, fontWeight: 950, color: isWinner ? "#EAF0FF" : "#FFB14A", fontStyle: "italic" }}>{challengeCtx.targetScore.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>FP</div>
        </div>
      </div>

      {/* Stats line */}
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 32, textAlign: "center" }}>
        {submitting ? "Submitting…" : attemptResult
          ? challengeStatsLine(attemptResult.attempt_count, attemptResult.winner_count, attemptResult.best_score, attemptResult.best_user_name)
          : ""}
      </div>

      {/* CTAs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 360 }}>
        <button
          onClick={() => {
            if (ctas.primaryAction === onSendItBack) {
              track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport });
            }
            ctas.primaryAction();
          }}
          style={{
            padding: "15px", borderRadius: 12, background: "#FFB14A",
            border: "none", color: "#070A12", fontSize: 16, fontWeight: 900, cursor: "pointer",
          }}
        >{ctas.primaryLabel}</button>
        <button
          onClick={() => {
            if (ctas.secondaryAction === onSendItBack) {
              track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport });
            }
            ctas.secondaryAction();
          }}
          style={{
            padding: "13px", borderRadius: 12, background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >{ctas.secondaryLabel}</button>
      </div>
    </div>
  );
}

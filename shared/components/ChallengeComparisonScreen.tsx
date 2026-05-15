// shared/components/ChallengeComparisonScreen.tsx
import { useEffect, useMemo, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { track } from "@shared/analytics/analytics";
import { isRealName } from "@shared/utils/isRealName";
import { chadTrashTalk, trashTalkBucket } from "@shared/commentary/chad";

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
  const namedChallenger = isRealName(challengeCtx.challengerName) ? challengeCtx.challengerName : null;

  // Chad's outcome-bucket trash talk — the sheet's only commentary line.
  // The tactical "line 1" used to live here too, but it now lands as a
  // Chad chip on the game surface ~1.5s before this sheet slides up.
  // Routes through the unnamed bank when the challenger name fails
  // isRealName (generic placeholder).
  const trashTalk = useMemo(() => {
    const delta = myScore - challengeCtx.targetScore;
    const bucket = trashTalkBucket(delta);
    return chadTrashTalk(bucket, namedChallenger, delta);
  }, [myScore, challengeCtx.targetScore, namedChallenger]);

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

  // Opposite-side label in the score comparison row. Real name → name;
  // generic placeholder → "CHALLENGE" so the recipient never sees the
  // generic nickname surface.
  const opponentLabel = namedChallenger ?? "CHALLENGE";

  return (
    <>
      <style>{`
        @keyframes ccsSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop — half-opacity over the game surface. Played hand and
          game bar (with TARGET) remain visible behind. */}
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9499,
      }} />

      {/* Bottom sheet — slides up over the game. Not a full page. */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9500,
        maxHeight: "82vh", overflowY: "auto",
        background: "#0D1117",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px 16px 0 0",
        padding: "20px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
        animation: "ccsSlideUp 350ms cubic-bezier(0.32, 0.72, 0, 1) both",
        color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        {/* Sheet handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: "rgba(255,255,255,0.18)", marginBottom: 14,
        }} />

        {/* Result headline — head-to-head delta leads. Tier shown smaller
            below as secondary context (challenge mode means the matchup is
            the primary outcome, not the absolute tier). */}
        {(() => {
          const delta = myScore - challengeCtx.targetScore;
          const absDelta = Math.abs(delta).toFixed(1);
          const isPhotoFinish = Math.abs(delta) <= 1;
          const headline = isPhotoFinish
            ? "Photo finish"
            : delta > 0
              ? `You beat them by ${absDelta} FP`
              : `Off by ${absDelta} FP`;
          const color = isPhotoFinish ? "#FFB14A" : delta > 0 ? "#22C55E" : "#EF4444";
          return (
            <div style={{ fontSize: 26, fontWeight: 950, color, marginBottom: 4, textAlign: "center" }}>
              {headline}
            </div>
          );
        })()}
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)", marginBottom: 8,
        }}>
          your hand: {myWinTier.replace("_", "-")}
        </div>
        {isBest && (
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
            color: "#FFB14A", border: "1px solid rgba(255,177,74,0.4)", borderRadius: 6, padding: "2px 8px",
            marginBottom: 12,
          }}>New Best Score</div>
        )}

        {/* Score comparison */}
        <div style={{
          display: "flex", gap: 20, marginBottom: 18, marginTop: 10,
          background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 24px",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>You</div>
            <div style={{ fontSize: 38, fontWeight: 950, color: isWinner ? "#22C55E" : "#EAF0FF", fontStyle: "italic" }}>{myScore.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>FP</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.12)", alignSelf: "stretch" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>{opponentLabel}</div>
            <div style={{ fontSize: 38, fontWeight: 950, color: isWinner ? "#EAF0FF" : "#FFB14A", fontStyle: "italic" }}>{challengeCtx.targetScore.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>FP</div>
          </div>
        </div>

        {/* Chad's outcome-bucket trash talk. The tactical Line 1 fires on
            the game surface ~1.5s before this sheet slides up; it isn't
            re-rendered here so the sheet stays focused on the rivalry
            verdict. */}
        <div style={{
          maxWidth: 420, textAlign: "center", marginBottom: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFB14A", lineHeight: 1.4 }}>
            {trashTalk}
          </div>
        </div>

        {/* Stats line */}
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 18, textAlign: "center" }}>
          {submitting ? "Submitting…" : attemptResult
            ? challengeStatsLine(attemptResult.attempt_count, attemptResult.winner_count, attemptResult.best_score, attemptResult.best_user_name)
            : ""}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 360 }}>
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
    </>
  );
}

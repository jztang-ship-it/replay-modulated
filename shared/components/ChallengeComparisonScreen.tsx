// shared/components/ChallengeComparisonScreen.tsx
//
// Bottom sheet shown when a challenge recipient finishes a hand. The
// sheet has THREE states that diverge on layout + CTAs:
//
//   WIN          — user's best-in-window beat the target. CTAs:
//                  "Send It Back" (fresh hand + challengeBackCtx) + Dismiss.
//   LOSS_OPEN    — best-in-window did NOT beat target AND window is still
//                  open. Live "N minutes to flip this" countdown.
//                  CTAs: "Try Again" (replays the snapshot) + Dismiss.
//   LOSS_CLOSED  — window closed without a win. Pure-practice framing.
//                  CTAs: "Play your own hand" + Dismiss (both clear
//                  challengeCtx and go to normal play).
//
// State source-of-truth is the attempt API response (user_has_won,
// is_window_open, window_closes_at_ms). Until the response lands we
// default to optimistic values derived from props.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { hasAttemptedChallenge, markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { track } from "@shared/analytics/analytics";
import { isRealName } from "@shared/utils/isRealName";
import { chadTrashTalk, trashTalkBucket } from "@shared/commentary/chad";

interface AttemptResult {
  attempt_id: string;
  is_best: boolean;
  is_practice?: boolean;
  is_personal_best?: boolean;
  winner_count_flipped?: boolean;
  defended_bumped?: boolean;
  window_closes_at?: string;
  window_closes_at_ms?: number;
  is_window_open?: boolean;
  user_best_score?: number | null;
  user_has_won?: boolean;
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
  /** Fired from win-state primary CTA. Caller clears challengeCtx,
   *  sets challengeBackCtx, closes the sheet, and deals a fresh
   *  normal hand. The share prompt auto-fires at that hand's RESULTS. */
  onSendItBack: () => void;
  /** Fired from loss-window-open primary CTA. Caller closes the sheet
   *  and re-deals the same challenge snapshot. challengeCtx stays set. */
  onTryAgain: () => void;
  /** Fired from any Dismiss CTA AND from the loss-window-closed
   *  primary ("Play your own hand"). Caller clears challengeCtx and
   *  closes the sheet — Push 2b adds a persistent action bar so the
   *  user can still reach DEAL after this. */
  onDismiss: () => void;
}

export function ChallengeComparisonScreen({
  challengeCtx, myScore, myWinTier, sport,
  onSendItBack, onTryAgain, onDismiss,
}: Props) {
  void myWinTier; // tier label removed from sheet — kept for caller compat

  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const submittedRef = useRef(false);

  const delta = myScore - challengeCtx.targetScore;
  const absDelta = Math.abs(delta);
  const isPhotoFinish = absDelta <= 1;

  const namedChallenger = isRealName(challengeCtx.challengerName) ? challengeCtx.challengerName : null;
  // Server truth, with optimistic fallbacks while the attempt POST is in flight:
  const userHasWon = attemptResult?.user_has_won ?? (delta > 0);
  const isWindowOpen = attemptResult?.is_window_open ?? true;
  const windowClosesAtMs = attemptResult?.window_closes_at_ms ?? null;
  // Server's authoritative is_practice; falls back to the local hint.
  const [localIsPractice] = useState(() => hasAttemptedChallenge(challengeCtx.challengeId));
  const isPractice = attemptResult?.is_practice ?? localIsPractice;

  // Three-way state derived once the server response lands.
  const state: "WIN" | "LOSS_OPEN" | "LOSS_CLOSED" =
    userHasWon ? "WIN"
    : isWindowOpen ? "LOSS_OPEN"
    : "LOSS_CLOSED";

  // Chad's outcome-bucket trash talk. Tactical line 1 fires as a chip
  // on the game surface ~1.5s before this sheet slides up.
  const trashTalk = useMemo(() => {
    const bucket = trashTalkBucket(delta);
    return chadTrashTalk(bucket, namedChallenger, delta);
  }, [delta, namedChallenger]);

  // Submit attempt POST exactly once on mount.
  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const uid = getPlayerUid();
    const name = getNickname() || "Anonymous";
    markChallengeAttempted(challengeCtx.challengeId);

    fetch(`/api/challenge/${challengeCtx.challengeId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: myScore,
        is_winner: delta > 0,
        is_practice: localIsPractice,
        user_id: uid || undefined,
        user_name: name,
      }),
    })
      .then(r => r.json())
      .then((d: AttemptResult) => {
        setAttemptResult(d);
        track("challenges", (delta > 0) ? "challenge_win" : "challenge_loss", {
          challenge_id: challengeCtx.challengeId,
          sport,
          score_delta: Math.round(delta * 10) / 10,
          attempt_count: d.attempt_count,
          is_practice: d.is_practice ?? localIsPractice,
          winner_flipped: d.winner_count_flipped ?? false,
          is_personal_best: d.is_personal_best ?? false,
          window_open: d.is_window_open ?? null,
        });
        track("challenges", "challenge_attempt_complete", {
          challenge_id: challengeCtx.challengeId, sport,
          is_winner: delta > 0, score: myScore,
          is_practice: d.is_practice ?? localIsPractice,
        });
      })
      .catch(() => { /* silent — UI still works with optimistic defaults */ });
  }, []); // eslint-disable-line

  // Live countdown — updates every 30s so the "47 minutes" label stays
  // close to true without burning CPU.
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (state !== "LOSS_OPEN" || !windowClosesAtMs) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [state, windowClosesAtMs]);
  const minutesLeft = windowClosesAtMs
    ? Math.max(0, Math.round((windowClosesAtMs - nowMs) / 60_000))
    : null;

  // Pronoun-free labels — the comparison frame never uses "them"/"they".
  const opponentLong = namedChallenger ?? "your friend";
  const opponentLabel = (namedChallenger ?? "FRIEND").toUpperCase();

  // Headline copy + color per state.
  const headline = (() => {
    if (isPhotoFinish) return "Photo finish";
    if (state === "WIN") return `You beat ${opponentLong} by ${absDelta.toFixed(1)} FP`;
    return `Off by ${absDelta.toFixed(1)} FP`;
  })();
  const headlineColor =
    state === "WIN" ? "#22C55E"
    : isPhotoFinish ? "#FFB14A"
    : state === "LOSS_OPEN" ? "#EF4444"
    : "#EAF0FF"; // closed window: neutral

  // CTA matrix per state. Send-back tap → analytics → onSendItBack;
  // try-again tap → analytics → onTryAgain; dismiss → onDismiss.
  const ctas = (() => {
    if (state === "WIN") {
      return {
        primaryLabel: "Send It Back",
        primaryAction: () => {
          track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport });
          onSendItBack();
        },
        secondaryLabel: "Dismiss",
        secondaryAction: onDismiss,
      };
    }
    if (state === "LOSS_OPEN") {
      return {
        primaryLabel: "Try Again",
        primaryAction: () => {
          track("challenges", "challenge_try_again", { challenge_id: challengeCtx.challengeId, sport, minutes_left: minutesLeft ?? -1 });
          onTryAgain();
        },
        secondaryLabel: "Dismiss",
        secondaryAction: onDismiss,
      };
    }
    // LOSS_CLOSED — "Play your own hand" and "Dismiss" both route to
    // onDismiss (clear challengeCtx, normal play). Keeping two CTAs for
    // visual hierarchy per spec.
    return {
      primaryLabel: "Play your own hand",
      primaryAction: () => {
        track("challenges", "challenge_play_own", { challenge_id: challengeCtx.challengeId, sport });
        onDismiss();
      },
      secondaryLabel: "Dismiss",
      secondaryAction: onDismiss,
    };
  })();

  return (
    <>
      <style>{`
        @keyframes ccsSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop — half-opacity over the game surface. */}
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9499,
      }} />

      {/* Bottom sheet */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9500,
        maxHeight: "85vh", overflowY: "auto",
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

        {/* Headline — head-to-head delta or "Photo finish". Pronoun-free. */}
        <div style={{ fontSize: 26, fontWeight: 950, color: headlineColor, marginBottom: 10, textAlign: "center" }}>
          {headline}
        </div>

        {/* Practice indicator — only when the server says this attempt
            doesn't count. Compact pill above the score row. */}
        {isPractice && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 6, padding: "2px 8px", marginBottom: 8,
          }}>Practice hand — doesn't change the score</div>
        )}

        {/* Score side-by-side */}
        <div style={{
          display: "flex", gap: 20, marginBottom: 18, marginTop: 10,
          background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 24px",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>You</div>
            <div style={{ fontSize: 38, fontWeight: 950, color: state === "WIN" ? "#22C55E" : "#EAF0FF", fontStyle: "italic" }}>{myScore.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>FP</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.12)", alignSelf: "stretch" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>{opponentLabel}</div>
            <div style={{ fontSize: 38, fontWeight: 950, color: state === "WIN" ? "#EAF0FF" : "#FFB14A", fontStyle: "italic" }}>{challengeCtx.targetScore.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>FP</div>
          </div>
        </div>

        {/* Trash-talk line — no delta number, no them/they pronouns. */}
        <div style={{ maxWidth: 420, textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFB14A", lineHeight: 1.4 }}>
            {trashTalk}
          </div>
        </div>

        {/* Urgency framing — only when state === LOSS_OPEN. Live minute
            countdown that ticks every 30s. Red+bold under 5 minutes. */}
        {state === "LOSS_OPEN" && minutesLeft != null && (
          <div style={{
            maxWidth: 360, marginBottom: 18, padding: "10px 14px",
            borderRadius: 10,
            background: minutesLeft < 5 ? "rgba(239,68,68,0.12)" : "rgba(255,177,74,0.10)",
            border: `1px solid ${minutesLeft < 5 ? "rgba(239,68,68,0.45)" : "rgba(255,177,74,0.35)"}`,
            color: minutesLeft < 5 ? "#FCA5A5" : "#FFB14A",
            fontSize: minutesLeft < 5 ? 16 : 14,
            fontWeight: minutesLeft < 5 ? 900 : 800,
            textAlign: "center",
          }}>
            {minutesLeft === 0
              ? "Window closing — last shot."
              : `${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} to flip this.`}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 360 }}>
          <button
            onClick={ctas.primaryAction}
            style={{
              padding: "15px", borderRadius: 12, background: "#FFB14A",
              border: "none", color: "#070A12", fontSize: 16, fontWeight: 900, cursor: "pointer",
            }}
          >{ctas.primaryLabel}</button>
          <button
            onClick={ctas.secondaryAction}
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

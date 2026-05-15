// shared/components/ChallengeComparisonScreen.tsx
import { useEffect, useMemo, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { hasAttemptedChallenge, markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { track } from "@shared/analytics/analytics";
import { isRealName } from "@shared/utils/isRealName";
import { chadTrashTalk, trashTalkBucket } from "@shared/commentary/chad";

interface AttemptResult {
  attempt_id: string;
  is_best: boolean;
  /** Server-determined: this attempt fell outside the user's 1-hour
   *  replay window. UI shows a "Practice — won't change your
   *  scorecard" affordance. */
  is_practice?: boolean;
  /** Whether this attempt set the user's new personal best for this
   *  challenge. Drives the score-callout highlight in Push 2. */
  is_personal_best?: boolean;
  /** True when this attempt flipped the challenge-level winner_count
   *  from a prior loss to a win for this user. */
  winner_count_flipped?: boolean;
  /** True when this attempt bumped the challenger's defended counter
   *  (losing attempt within window, non-self). */
  defended_bumped?: boolean;
  /** ISO timestamp when this user's replay window closes. Drives the
   *  "47 minutes to flip this" countdown in Push 2. */
  window_closes_at?: string;
  window_closes_at_ms?: number;
  is_window_open?: boolean;
  user_best_score?: number | null;
  user_has_won?: boolean;
  /** Challenge totals */
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
  /** Pre-creation hook: silently creates the return-challenge row on
   *  the server when the sheet mounts and returns the share payload.
   *  The sheet stores the result so the tap handler can call
   *  navigator.share() synchronously, preserving the user-gesture
   *  context (Safari/Chrome reject async-then-share). */
  prepareChallenge: () => Promise<{ url: string; text: string; title: string }>;
  onPlayFresh: () => void;
}

export function ChallengeComparisonScreen({ challengeCtx, myScore, myWinTier, sport, prepareChallenge, onPlayFresh }: Props) {
  void myWinTier; // tier label removed from sheet — kept on props for caller compat / future use
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const [, setSubmitting] = useState(true);
  // Pre-created share payload. null = still creating; non-null = ready.
  const [sharePayload, setSharePayload] = useState<{ url: string; text: string; title: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const isNewUser = typeof window !== "undefined" && localStorage.getItem(`replaymod_ftue_${sport}`) !== "1";

  const isWinner = myScore > challengeCtx.targetScore;
  const namedChallenger = isRealName(challengeCtx.challengerName) ? challengeCtx.challengerName : null;
  // Practice flag — initially seeded from the local "this user already
  // played this challenge" marker, then overwritten by the server's
  // authoritative `is_practice` verdict once the attempt response lands.
  // The server knows the window state (per-user 1-hour window keyed to
  // first_attempt_at) and is the source of truth.
  const [isPractice, setIsPractice] = useState(() => hasAttemptedChallenge(challengeCtx.challengeId));

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

  // Pre-create the return challenge on mount so navigator.share() can fire
  // synchronously from the tap handler.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await prepareChallenge();
        if (!cancelled) setSharePayload(payload);
      } catch (e: any) {
        if (!cancelled) setShareError(e?.message ? String(e.message) : "Couldn't prepare the challenge.");
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // Synchronous Send-It-Back: invokes navigator.share() in the tap handler
  // body, no async work before the call. Falls back to clipboard, then to
  // an inline URL display if both APIs are unavailable.
  const SEND_BACK_SENTINEL = "__send_it_back__";
  const handleSendItBack = () => {
    setShareError(null);
    setShareInfo(null);

    // Capture the URL once — if the share API rejects async, fallbacks can
    // still surface the URL without re-fetching.
    const payload = sharePayload;
    if (!payload) {
      // Pre-creation failed (or hasn't completed). Retry on-tap as a
      // graceful degradation. This branch may fail on Safari due to the
      // post-await user-gesture issue, but we still want to try.
      setRetrying(true);
      void (async () => {
        try {
          const fresh = await prepareChallenge();
          setSharePayload(fresh);
          // Try navigator.share — likely to fail on Safari here but worth
          // attempting on browsers that allow post-await share.
          if (navigator.share) {
            try { await navigator.share({ title: fresh.title, text: fresh.text, url: fresh.url }); return; }
            catch (err: any) { if (err?.name !== "AbortError") throw err; return; }
          }
          throw new Error("Share API unavailable");
        } catch (e: any) {
          // Clipboard fallback (also fine to be async on retry path)
          if (navigator.clipboard?.writeText && sharePayload?.url) {
            try {
              await navigator.clipboard.writeText(`${sharePayload.url}\n${sharePayload.text}`);
              setShareInfo("Link copied — paste it anywhere.");
              return;
            } catch { /* fall through */ }
          }
          setShareError(`Couldn't share. ${e?.message ?? ""}`.trim());
        } finally {
          setRetrying(false);
        }
      })();
      return;
    }

    // Fast path — pre-creation already complete. Invoke navigator.share
    // synchronously (no awaits before this call) to keep the user gesture.
    if (navigator.share) {
      navigator
        .share({ title: payload.title, text: payload.text, url: payload.url })
        .catch((err: any) => {
          if (err?.name === "AbortError") return;
          // Browser rejected the share (e.g. no app, permission). Try clipboard.
          if (navigator.clipboard?.writeText) {
            navigator.clipboard
              .writeText(`${payload.url}\n${payload.text}`)
              .then(() => setShareInfo("Link copied — paste it anywhere."))
              .catch(() => setShareError(`Couldn't share. Copy this URL: ${payload.url}`));
          } else {
            setShareError(`Couldn't share. Copy this URL: ${payload.url}`);
          }
        });
      return;
    }

    // No Web Share API — clipboard path.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(`${payload.url}\n${payload.text}`)
        .then(() => setShareInfo("Link copied — paste it anywhere."))
        .catch(() => setShareError(`Couldn't copy. URL: ${payload.url}`));
      return;
    }

    // Last resort — show URL inline for manual copy.
    setShareError(`Share unavailable. Copy this URL: ${payload.url}`);
  };

  // Primary/secondary CTA labels — derived from (new vs existing) × (won vs lost).
  // Pronoun-free: use the challenger's name when real, otherwise "Your Friend".
  const opponentNoun = namedChallenger ?? "Your Friend";
  const ctas = (() => {
    if (isWinner) {
      // Won: both new and existing → Send It Back primary, Play Fresh secondary
      return {
        primaryLabel: "Send It Back",
        primaryAction: SEND_BACK_SENTINEL,
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
        secondaryAction: SEND_BACK_SENTINEL,
      };
    }
    return {
      primaryLabel: `Make ${opponentNoun} Prove It Again`,
      primaryAction: SEND_BACK_SENTINEL,
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
        is_practice: isPractice,
        user_id: uid || undefined,
        user_name: name,
      }),
    })
      .then(r => r.json())
      .then((d: AttemptResult) => {
        setAttemptResult(d);
        setSubmitting(false);
        // Overwrite the client-side hint with the server verdict — the
        // server is the source of truth on window state.
        if (typeof d.is_practice === "boolean") setIsPractice(d.is_practice);
        track("challenges", isWinner ? "challenge_win" : "challenge_loss", {
          challenge_id: challengeCtx.challengeId,
          sport,
          score_delta: Math.round((myScore - challengeCtx.targetScore) * 10) / 10,
          attempt_count: d.attempt_count,
          is_practice: d.is_practice ?? isPractice,
          winner_flipped: d.winner_count_flipped ?? false,
          is_personal_best: d.is_personal_best ?? false,
          window_open: d.is_window_open ?? null,
        });
        track("challenges", "challenge_attempt_complete", {
          challenge_id: challengeCtx.challengeId, sport,
          is_winner: isWinner, score: myScore,
          is_practice: d.is_practice ?? isPractice,
        });
      })
      .catch(() => setSubmitting(false));
  }, []); // eslint-disable-line

  void attemptResult; // server stats line removed per spec; kept for future head-to-head wiring

  // Opposite-side label in the score comparison row. Real name → name;
  // generic placeholder → "FRIEND" (not "CHALLENGE") so the column header
  // reads as a person, not a thing.
  const opponentLabel = (namedChallenger ?? "FRIEND").toUpperCase();

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

        {/* Result headline — head-to-head delta leads. Names the rival
            instead of using "them" / "they" pronouns. Tier label removed
            per spec — challenge mode means the matchup IS the verdict. */}
        {(() => {
          const delta = myScore - challengeCtx.targetScore;
          const absDelta = Math.abs(delta).toFixed(1);
          const isPhotoFinish = Math.abs(delta) <= 1;
          const opponent = namedChallenger ?? "your friend";
          const headline = isPhotoFinish
            ? "Photo finish"
            : delta > 0
              ? `You beat ${opponent} by ${absDelta} FP`
              : `Off by ${absDelta} FP`;
          const color = isPhotoFinish ? "#FFB14A" : delta > 0 ? "#22C55E" : "#EF4444";
          return (
            <div style={{ fontSize: 26, fontWeight: 950, color, marginBottom: 10, textAlign: "center" }}>
              {headline}
            </div>
          );
        })()}
        {isPractice && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 6, padding: "2px 8px", marginBottom: 8,
          }}>Practice hand — doesn't change the score</div>
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

        {/* Chad's outcome-bucket trash talk. Tactical Line 1 fires on the
            game surface ~1.5s before this sheet slides up. */}
        <div style={{ maxWidth: 420, textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFB14A", lineHeight: 1.4 }}>
            {trashTalk}
          </div>
        </div>

        {/* (Phase 2 will add a head-to-head section here.) */}

        {/* Status banners. shareInfo is a soft positive toast (e.g. "Link
            copied"). shareError is a hard failure. Tapping either dismisses. */}
        {shareInfo && (
          <div
            onClick={() => setShareInfo(null)}
            style={{
              width: "100%", maxWidth: 360, marginBottom: 10,
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.45)",
              color: "#86EFAC", fontSize: 13, fontWeight: 700,
              cursor: "pointer", textAlign: "center",
            }}
          >
            {shareInfo}
          </div>
        )}
        {shareError && (
          <div
            onClick={() => setShareError(null)}
            style={{
              width: "100%", maxWidth: 360, marginBottom: 10,
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.45)",
              color: "#FCA5A5", fontSize: 13, fontWeight: 700,
              cursor: "pointer", textAlign: "center",
              wordBreak: "break-all",
            }}
            role="alert"
          >
            {shareError} <span style={{ opacity: 0.7, fontWeight: 500 }}>— tap to dismiss</span>
          </div>
        )}

        {/* CTAs.
            Send-It-Back buttons stay tappable; pre-creation runs in the
            background. While the URL is still being prepared, the button
            reads "Preparing…" and the tap initiates a slower retry path. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 360 }}>
          {(() => {
            const isSendBackPrimary = ctas.primaryAction === SEND_BACK_SENTINEL;
            const preparing = isSendBackPrimary && !sharePayload && !shareError;
            const busy = isSendBackPrimary && retrying;
            const label = preparing && !busy
              ? `${ctas.primaryLabel} — preparing…`
              : busy
                ? "Sharing…"
                : ctas.primaryLabel;
            return (
              <button
                onClick={() => {
                  if (isSendBackPrimary) {
                    track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport });
                    handleSendItBack();
                  } else {
                    (ctas.primaryAction as () => void)();
                  }
                }}
                disabled={isSendBackPrimary && busy}
                style={{
                  padding: "15px", borderRadius: 12, background: "#FFB14A",
                  border: "none", color: "#070A12", fontSize: 16, fontWeight: 900,
                  cursor: busy ? "default" : "pointer",
                  opacity: preparing || busy ? 0.85 : 1,
                }}
              >{label}</button>
            );
          })()}
          {(() => {
            const isSendBackSecondary = ctas.secondaryAction === SEND_BACK_SENTINEL;
            const preparing = isSendBackSecondary && !sharePayload && !shareError;
            const busy = isSendBackSecondary && retrying;
            const label = preparing && !busy
              ? `${ctas.secondaryLabel} — preparing…`
              : busy
                ? "Sharing…"
                : ctas.secondaryLabel;
            return (
              <button
                onClick={() => {
                  if (isSendBackSecondary) {
                    track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport });
                    handleSendItBack();
                  } else {
                    (ctas.secondaryAction as () => void)();
                  }
                }}
                disabled={isSendBackSecondary && busy}
                style={{
                  padding: "13px", borderRadius: 12, background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)",
                  fontSize: 14, fontWeight: 700,
                  cursor: busy ? "default" : "pointer",
                  opacity: preparing || busy ? 0.7 : 1,
                }}
              >{label}</button>
            );
          })()}
        </div>
      </div>
    </>
  );
}

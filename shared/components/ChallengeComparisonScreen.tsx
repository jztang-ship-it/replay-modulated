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
// Visibility: the sheet element stays mounted across re-summons so the
// attempt POST fires only once. The `collapsed` prop toggles whether the
// sheet is visually present or hidden (translated off-screen). When
// collapsed, GameView renders the persistent action bar + trash-talk
// chip on the game surface (items 7/8).
//
// Dismiss surfaces: × button top-right, swipe-down on the sheet body,
// tap on the dimmed backdrop. All three call onCollapse, which toggles
// the collapsed state in GameView. The inner "Dismiss" CTA likewise
// collapses — the action bar's [DEAL] is the real "leave challenge"
// path that clears challengeCtx.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types";
import { track } from "@shared/analytics/analytics";
import { isRealName } from "@shared/utils/isRealName";
import { chadTrashTalk, trashTalkBucket, selectChallengeResolution } from "@shared/commentary/chadChallenge";
import { useChallengeAttempt, type ChallengeAttemptState } from "@shared/hooks/useChallengeAttempt";
import { BossOutwardEnding } from "./BossOutwardEnding";

// Re-exported under the original name so existing call sites that
// import ComparisonState continue to compile. Phase 5a commit 1
// (2026-05-27) extracted the attempt-POST + state-derivation into
// useChallengeAttempt; the type lives there now.
export type ComparisonState = ChallengeAttemptState;

interface Props {
  challengeCtx: ChallengeCtx;
  myScore: number;
  /** Recipient's resolved roster (post-RESOLVE). Phase 5b commit 2
   *  (2026-05-28): threaded through to useChallengeAttempt so the
   *  legacy comparison-sheet path also populates
   *  challenge_attempts.score_breakdown + user_notifications.payload.
   *  attempter_roster, parity with the H2HRecipientReveal path. */
  myRoster: GeneratedCard[];
  myWinTier: string;
  sport: string;
  /** When true the sheet is rendered off-screen (display continues to
   *  mount so the attempt POST fires only once). GameView controls. */
  collapsed?: boolean;
  /** Fired when the user dismisses the sheet (×, backdrop tap, swipe,
   *  or inner "Dismiss" CTA). GameView keeps challengeCtx set and
   *  surfaces the persistent action bar. */
  onCollapse: () => void;
  /** Fired from win-state primary CTA. Caller clears challengeCtx,
   *  sets challengeBackCtx, deals a fresh normal hand. */
  onSendItBack: () => void;
  /** Fired from loss-window-open primary CTA. Caller re-deals the
   *  challenge snapshot (challengeCtx stays set). */
  onTryAgain: () => void;
  /** Phase 2-mount Step 5 — "Play Again" for the boss outward ending: clears
   *  challengeCtx + deals a fresh normal hand (GameView.handlePlayOwnHand).
   *  Boss path only; human states never read it. Falls back to onCollapse. */
  onPlayAgain?: () => void;
  /** Emitted exactly once when the attempt POST resolves. Lets
   *  GameView mirror state (trash-talk text for the chip, comparison
   *  state for the action bar, etc.) onto its surface. */
  onResolved?: (info: {
    state: ComparisonState;
    trashTalk: string;
    windowClosesAtMs: number | null;
  }) => void;
}

export function ChallengeComparisonScreen({
  challengeCtx, myScore, myRoster, myWinTier, sport,
  collapsed = false,
  onCollapse, onSendItBack, onTryAgain, onPlayAgain, onResolved,
}: Props) {
  void myWinTier;

  // Phase 5a commit 1 (2026-05-27): attempt POST + state derivation
  // lifted into useChallengeAttempt. The hook fires POST-on-mount
  // (enabled=true) with the same request shape, response handling,
  // and state-machine logic this component had inline.
  const {
    state,
    delta,
    absDelta,
    isPhotoFinish,
    windowClosesAtMs,
    attemptResult,
    localIsPractice,
  } = useChallengeAttempt({
    challengeId: challengeCtx.challengeId,
    myScore,
    targetScore: challengeCtx.targetScore,
    sport,
    enabled: true,
    resolvedRoster: myRoster,
  });
  const resolvedRef = useRef(false);

  const namedChallenger = isRealName(challengeCtx.challengerName) ? challengeCtx.challengerName : null;
  const isPractice = attemptResult?.is_practice === true;

  // Two commentary surfaces, independent banks:
  //   resolutionLine — substantive two-clause WHY shown ON the sheet
  //                    (selectChallengeResolution). Routes by signed
  //                    delta so photo-finish +1 celebrates and -1
  //                    commiserates.
  //   trashTalk      — punchy short callout mirrored to the post-result
  //                    chip on GameView via onResolved. Pill-friendly.
  //                    Unchanged behavior; lives on its own random pool.
  const resolutionLine = useMemo(
    () => selectChallengeResolution({
      myScore,
      posterScore: challengeCtx.targetScore,
      posterName: namedChallenger,
    }),
    [myScore, challengeCtx.targetScore, namedChallenger],
  );
  const trashTalk = useMemo(() => {
    const bucket = trashTalkBucket(delta);
    return chadTrashTalk(bucket, namedChallenger, delta);
  }, [delta, namedChallenger]);

  // Mirror the resolved state up to GameView once.
  useEffect(() => {
    if (resolvedRef.current) return;
    if (!attemptResult) return;
    resolvedRef.current = true;
    onResolved?.({ state, trashTalk, windowClosesAtMs });
  }, [attemptResult, state, trashTalk, windowClosesAtMs, onResolved]);

  // [Timer:v3] Live countdown — anchored to the SERVER'S first_attempt_at.
  //
  // The server returns first_attempt_at_ms (anchor) and window_closes_at_ms
  // (= first_attempt_at_ms + 1h) on every attempt POST. Both values are
  // STABLE across replays by the same identity within the same window —
  // they reflect the user's earliest attempt for this challenge, not the
  // current attempt's timestamp. The timer reads window_closes_at_ms
  // and decrements via 1Hz nowMs tick.
  //
  // Optimistic fallback: only used when this is the user's KNOWN FIRST
  // attempt (no localStorage marker for this challenge). For known
  // replays (marker present) we suppress the 60:00 fallback so the
  // timer doesn't briefly mislead while the POST is in flight — better
  // to show "—:—" for 300-1000ms than to flash a wrong value. If the
  // POST fails (server bug, network), the timer stays "—:—" and that's
  // a visible signal something's wrong.
  //
  // Canary log fires every time attemptResult lands. If you see
  //   [Timer:v3] anchor first_attempt_at=...  source=server
  // and the first_attempt_at_iso is IDENTICAL across consecutive
  // replays within the same window, the anchor is stable (correct).
  // If it CHANGES across replays, the server's prior-attempt lookup
  // is missing the earlier row — most likely cause: migration 010
  // not applied (anon path) or rm_uid changing between sessions.
  const ONE_HOUR_MS_CONST = 60 * 60 * 1000;
  const [sheetMountTimeMs] = useState(() => Date.now());
  const isKnownReplay = localIsPractice;
  // server value when present; otherwise optimistic fallback only on
  // first attempt; null (= "—:—") on known replay while waiting.
  const effectiveWindowClosesAtMs: number | null =
    windowClosesAtMs ??
    (isKnownReplay ? null : sheetMountTimeMs + ONE_HOUR_MS_CONST);

  useEffect(() => {
    if (!attemptResult) return;
    // eslint-disable-next-line no-console
    console.info("[Timer:v3] anchor", {
      source: attemptResult.window_closes_at_ms ? "server" : "fallback",
      first_attempt_at: attemptResult.first_attempt_at ?? null,
      first_attempt_at_ms: attemptResult.first_attempt_at_ms ?? null,
      window_closes_at: attemptResult.window_closes_at ?? null,
      window_closes_at_ms: attemptResult.window_closes_at_ms ?? null,
      remaining_seconds: attemptResult.window_closes_at_ms
        ? Math.max(0, Math.floor((attemptResult.window_closes_at_ms - Date.now()) / 1000))
        : null,
      is_known_replay: isKnownReplay,
      sheet_mount_time_ms: sheetMountTimeMs,
    });
  }, [attemptResult, isKnownReplay, sheetMountTimeMs]);

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (state !== "LOSS_OPEN") return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [state]);
  const secondsLeft = effectiveWindowClosesAtMs == null
    ? null
    : Math.max(0, Math.floor((effectiveWindowClosesAtMs - nowMs) / 1000));
  const mm = secondsLeft == null ? null : Math.floor(secondsLeft / 60);
  const ss = secondsLeft == null ? null : secondsLeft % 60;
  const countdownLabel = secondsLeft == null
    ? "—:—"
    : `${mm}:${ss!.toString().padStart(2, "0")}`;
  // Urgency threshold uses the original 5-minute boundary for color/size.
  // Null seconds (waiting for server on a replay) = not urgent.
  const isUrgent = secondsLeft != null && secondsLeft < 5 * 60;

  const opponentLong = namedChallenger ?? "your friend";
  const opponentLabel = (namedChallenger ?? "FRIEND").toUpperCase();

  const headline = (() => {
    if (isPhotoFinish) return "Photo finish";
    if (state === "WIN") return `You beat ${opponentLong} by ${absDelta.toFixed(1)} FP`;
    return `Off by ${absDelta.toFixed(1)} FP`;
  })();
  const headlineColor =
    state === "WIN" ? "#22C55E"
    : isPhotoFinish ? "#FFB14A"
    : state === "LOSS_OPEN" ? "#EF4444"
    : "#EAF0FF";

  const ctas = (() => {
    if (state === "WIN") {
      return {
        primaryLabel: "Send It Back",
        primaryAction: () => {
          track("challenges", "challenge_send_back", { challenge_id: challengeCtx.challengeId, sport });
          onSendItBack();
        },
      };
    }
    if (state === "LOSS_OPEN") {
      return {
        primaryLabel: "Try Again",
        primaryAction: () => {
          track("challenges", "challenge_try_again", { challenge_id: challengeCtx.challengeId, sport, seconds_left: secondsLeft });
          onTryAgain();
        },
      };
    }
    return {
      primaryLabel: "Play your own hand",
      primaryAction: () => {
        track("challenges", "challenge_play_own", { challenge_id: challengeCtx.challengeId, sport });
        onCollapse();
      },
    };
  })();

  // Swipe-down gesture on the sheet body. Minimal, no library.
  const dragStartYRef = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const [dragDeltaPx, setDragDeltaPx] = useState(0);
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
    dragDeltaRef.current = 0;
    setDragDeltaPx(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current == null) return;
    const d = e.touches[0].clientY - dragStartYRef.current;
    if (d > 0) {
      dragDeltaRef.current = d;
      setDragDeltaPx(d);
    }
  };
  const onTouchEnd = () => {
    if (dragStartYRef.current == null) return;
    dragStartYRef.current = null;
    if (dragDeltaRef.current > 90) {
      onCollapse();
    }
    setDragDeltaPx(0);
  };

  // Phase 2-mount Step 5 — boss results terminate OUTWARD, not through the human
  // rivalry sheet. Early fork AFTER all hooks (the attempt POST above already
  // fired → the boss attempt + KV count are recorded); the human
  // WIN/LOSS_OPEN/LOSS_CLOSED render below is PROVABLY UNENTERED for a boss.
  // BossOutwardEnding records the result and renders from getBossResult — the
  // same single source the BossLandingView revisit reads, so fresh and revisited
  // are byte-identical.
  if (challengeCtx.senderKind === "boss") {
    const won = myScore >= challengeCtx.targetScore;
    return (
      <div
        data-testid="boss-result-sheet"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
          background: "linear-gradient(180deg, #0D1628 0%, #070A12 100%)",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "18px 18px 0 0", padding: "24px 20px 32px",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
        }}
      >
        <BossOutwardEnding
          sport={sport}
          bossChallengeId={challengeCtx.challengeId}
          freshResult={{ score: myScore, won }}
          onPlayAgain={onPlayAgain ?? onCollapse}
        />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes ccsSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop — tap-to-collapse. Visibility tied to !collapsed so the
          game surface is fully visible when the sheet is hidden. */}
      <div
        onClick={onCollapse}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9499,
          pointerEvents: collapsed ? "none" : "auto",
          opacity: collapsed ? 0 : 1,
          transition: "opacity 220ms ease",
        }}
        aria-hidden={collapsed}
      />

      {/* Bottom sheet */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9500,
          maxHeight: "85vh", overflowY: "auto",
          background: "#0D1117",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px 16px 0 0",
          padding: "20px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
          animation: collapsed ? "none" : "ccsSlideUp 350ms cubic-bezier(0.32, 0.72, 0, 1) both",
          transform: collapsed ? "translateY(105%)" : `translateY(${dragDeltaPx}px)`,
          transition: collapsed
            ? "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)"
            : dragDeltaPx > 0 ? "none" : "transform 220ms ease",
          color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
          display: "flex", flexDirection: "column", alignItems: "center",
          pointerEvents: collapsed ? "none" : "auto",
        }}
      >
        {/* Close × — top-right of the sheet */}
        <button
          onClick={onCollapse}
          aria-label="Close result"
          style={{
            position: "absolute", top: 10, right: 14,
            width: 32, height: 32, borderRadius: 16,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.55)",
            fontSize: 16, fontWeight: 700, lineHeight: 1, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >×</button>

        {/* Sheet handle (also a swipe-down target) */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: "rgba(255,255,255,0.18)", marginBottom: 14,
        }} />

        <div style={{ fontSize: 26, fontWeight: 950, color: headlineColor, marginBottom: 10, textAlign: "center" }}>
          {headline}
        </div>

        {isPractice && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 6, padding: "2px 8px", marginBottom: 8,
          }}>Practice hand — doesn't change the score</div>
        )}

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

        {/* Resolution commentary — sheet's primary WHY line. Substantive
            two-clause output from selectChallengeResolution; routed by
            signed delta so +1 / -1 photo-finish moments diverge. The
            short pill-shaped trash-talk lives on the post-result chip
            (mirrored via onResolved); this slot was previously the
            short trash-talk callout and is now suppressed in favor of
            the WHY line — see PR notes for the "occluded bubble" cut. */}
        <div style={{ maxWidth: 420, textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFB14A", lineHeight: 1.45 }}>
            {resolutionLine}
          </div>
        </div>

        {state === "LOSS_OPEN" && (
          <div style={{
            maxWidth: 360, marginBottom: 18, padding: "10px 14px",
            borderRadius: 10,
            background: isUrgent ? "rgba(239,68,68,0.12)" : "rgba(255,177,74,0.10)",
            border: `1px solid ${isUrgent ? "rgba(239,68,68,0.45)" : "rgba(255,177,74,0.35)"}`,
            color: isUrgent ? "#FCA5A5" : "#FFB14A",
            fontSize: isUrgent ? 16 : 14,
            fontWeight: isUrgent ? 900 : 800,
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}>
            {secondsLeft === 0
              ? "Window closing — last shot."
              : secondsLeft == null
                ? "—:— to flip this."
                : `${countdownLabel} to flip this.`}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 360 }}>
          <button
            onClick={ctas.primaryAction}
            style={{
              padding: "15px", borderRadius: 12, background: "#FFB14A",
              border: "none", color: "#070A12", fontSize: 16, fontWeight: 900, cursor: "pointer",
            }}
          >{ctas.primaryLabel}</button>
          <button
            onClick={onCollapse}
            style={{
              padding: "13px", borderRadius: 12, background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >Dismiss</button>
        </div>
      </div>
    </>
  );
}

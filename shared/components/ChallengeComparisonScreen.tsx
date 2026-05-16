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
  first_attempt_at?: string;
  first_attempt_at_ms?: number;
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

export type ComparisonState = "WIN" | "LOSS_OPEN" | "LOSS_CLOSED";

interface Props {
  challengeCtx: ChallengeCtx;
  myScore: number;
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
  challengeCtx, myScore, myWinTier, sport,
  collapsed = false,
  onCollapse, onSendItBack, onTryAgain, onResolved,
}: Props) {
  void myWinTier;

  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const submittedRef = useRef(false);
  const resolvedRef = useRef(false);

  const delta = myScore - challengeCtx.targetScore;
  const absDelta = Math.abs(delta);
  const isPhotoFinish = absDelta <= 1;

  const namedChallenger = isRealName(challengeCtx.challengerName) ? challengeCtx.challengerName : null;
  // [Comparison:v2] State machine drives off the CURRENT attempt's
  // outcome, NOT the user's cumulative historical state. Earlier
  // versions read attemptResult.user_has_won which is "newIsWinner ||
  // prevBestWasWin" — cumulative — so a user who'd previously won this
  // challenge would see the WIN frame (green headline, Send-It-Back
  // CTA) on a losing replay. Per-attempt outcome means: this score >
  // target = WIN, else loss-with-window-state. Cumulative state stays
  // on the counters (winner_count, best_score) — those remain
  // historical.
  const userWonThisAttempt = delta > 0;
  const isWindowOpen = attemptResult?.is_window_open ?? true;
  const windowClosesAtMs = attemptResult?.window_closes_at_ms ?? null;
  // Local "has played before" hint — useful as telemetry context on the
  // attempt POST, but NEVER used to drive the practice-label display.
  // The server's window math is authoritative: within-window replays
  // are live attempts, not practice. Driving the chip off the local
  // marker would falsely label every replay as practice during the
  // brief window between sheet mount and the attempt response.
  const [localIsPractice] = useState(() => hasAttemptedChallenge(challengeCtx.challengeId));
  const isPractice = attemptResult?.is_practice === true;

  const state: ComparisonState =
    userWonThisAttempt ? "WIN"
    : isWindowOpen ? "LOSS_OPEN"
    : "LOSS_CLOSED";

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

    // The server needs an identity to anchor the 1-hour replay window
    // to. For signed-in players the Supabase auth uuid (a real uuid)
    // lands in user_id. For anonymous players getPlayerUid returns the
    // localStorage rm_uid (e.g. "u_abc123def") — not a uuid, so we send
    // it as anon_uid so the server can still cluster prior attempts by
    // this browser. Sending both is harmless: the server uses user_id
    // when it parses as a uuid and only falls back to anon_uid
    // otherwise. (See attempt.ts and migration 010.)
    const isAuthUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);

    fetch(`/api/challenge/${challengeCtx.challengeId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: myScore,
        is_winner: delta > 0,
        is_practice: localIsPractice,
        user_id: isAuthUuid ? uid : undefined,
        anon_uid: isAuthUuid ? undefined : uid,
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

        <div style={{ maxWidth: 420, textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFB14A", lineHeight: 1.4 }}>
            {trashTalk}
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

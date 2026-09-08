// shared/hooks/useChallengeAttempt.ts
//
// Phase 5a commit 1 (2026-05-27): extracted verbatim from
// ChallengeComparisonScreen.tsx:93-199. Behavior-preserving refactor —
// the POST request shape, response handling, and state-derivation logic
// were copied without changes so the existing comparison sheet path
// stays identical. Phase 5a commits 2/3 (H2H wrapper + prefetch + ×
// dismiss path) consume this hook alongside the comparison sheet.
//
// The hook fires `POST /api/challenge/${challengeId}/attempt` exactly
// once per mount when `enabled` is true and `challengeId` is non-null.
// Re-firing requires consumer unmount/remount or a `challengeId` change
// (gated by `submittedRef` + the effect dep array). Errors are caught
// silently — the existing comparison sheet renders sensible defaults
// (isWindowOpen ?? true, etc.) when `attemptResult` stays null.

import { useEffect, useRef, useState } from "react";
import { getNickname } from "@shared/utils/playerIdentity";
import { supabase } from "@shared/lib/supabase";
import { hasAttemptedChallenge, markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { track } from "@shared/analytics/analytics";
import { chDebug } from "@shared/lib/chDebug";

export interface AttemptResult {
  attempt_id: string;
  is_best: boolean;
  score?: number;
  is_winner?: boolean;
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

export type ChallengeAttemptState = "WIN" | "LOSS_OPEN" | "LOSS_CLOSED";

export interface UseChallengeAttemptArgs {
  challengeId: string | null;
  /** Server-verified hand_log ID used as the only score source. */
  handId?: string | null;
  myScore: number;
  targetScore: number;
  /** Sport identifier — required for analytics tracking inside the
   *  POST response handler. Mirrors the `sport` arg passed to the
   *  existing track() calls in ChallengeComparisonScreen.tsx:184,193. */
  sport: string;
  /** Defer the POST until the consumer is ready. Today's
   *  ChallengeComparisonScreen always passes true (POST-on-mount
   *  behavior); phase 5a's H2H wrapper waits for the arc to settle. */
  enabled: boolean;
  /** Layer C, delta-b/c: the sender-stable referral token captured off a
   *  forwarded boss link's ?ref param. When present, the POST body includes
   *  referrer_token so the attempt row carries it (challenge_attempts
   *  .referrer_token, the lobby-write half; the READ is delta-c). Optional —
   *  OMITTED from the body when absent, so direct boss plays and all human
   *  challenges send a byte-identical body and the server's null default holds. */
  referrerToken?: string;
}

export interface UseChallengeAttemptReturn {
  state: ChallengeAttemptState;
  /** Signed display delta. Before the response arrives this uses the local display score; after that it uses the server score. */
  delta: number;
  absDelta: number;
  /** absDelta <= 1, preserving the existing threshold from
   *  ChallengeComparisonScreen.tsx:99. */
  isPhotoFinish: boolean;
  /** From the server's attempt response. null until POST resolves. */
  windowClosesAtMs: number | null;
  attemptResult: AttemptResult | null;
  /** True while the POST is in flight and no error has been recorded.
   *  Existing ChallengeComparisonScreen consumers do not read this
   *  field (they render with default values); future consumers can
   *  show a loading state if desired. */
  isLoading: boolean;
  /** Captured from the fetch's `.catch`. Existing consumers do not read
   *  this field — error handling stays silent and the UI renders with
   *  optimistic defaults. */
  error: Error | null;
  /** localStorage-derived hint (`hasAttemptedChallenge(challengeId)` at
   *  hook mount) that the user has attempted this challenge before.
   *  Re-exposed so the consumer can drive timer-fallback logic that
   *  depends on this hint. Mirrors ChallengeComparisonScreen.tsx:120. */
  localIsPractice: boolean;
}

export function useChallengeAttempt(args: UseChallengeAttemptArgs): UseChallengeAttemptReturn {
  const { challengeId, handId, myScore, targetScore, sport, enabled, referrerToken } = args;

  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const [authoritativeScore, setAuthoritativeScore] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const submittedRef = useRef(false);

  // Captured at hook mount — never changes for the life of the hook.
  // Mirrors ChallengeComparisonScreen.tsx:120 exactly: a null challengeId
  // means there's nothing to check, so default false (treated as
  // first-attempt).
  const [localIsPractice] = useState(() =>
    challengeId ? hasAttemptedChallenge(challengeId) : false,
  );

  // myScore is presentation-only. The server response becomes authoritative as soon as it arrives.
  const effectiveScore = authoritativeScore ?? myScore;
  const delta = effectiveScore - targetScore;
  const absDelta = Math.abs(delta);
  const isPhotoFinish = absDelta <= 1;

  // [Comparison:v2] State machine drives off the CURRENT attempt's
  // outcome, NOT the user's cumulative historical state. (Verbatim
  // copy of the rationale from ChallengeComparisonScreen.tsx:102-110.)
  const userWonThisAttempt = delta > 0;
  const isWindowOpen = attemptResult?.is_window_open ?? true;
  const windowClosesAtMs = attemptResult?.window_closes_at_ms ?? null;

  const state: ChallengeAttemptState =
    userWonThisAttempt ? "WIN"
      : isWindowOpen ? "LOSS_OPEN"
        : "LOSS_CLOSED";

  // Submit attempt POST exactly once per mount when enabled.
  // Submit only the verified hand reference and presentation metadata.
  // Score, winner and score_breakdown are intentionally absent: the API
  // derives them from the authenticated user's verified hand_log row.
  useEffect(() => {
    if (!enabled) return;
    if (!challengeId) return;
    if (submittedRef.current) return;
    if (!handId) return;
    submittedRef.current = true;
    const name = getNickname() || "Anonymous";
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Authentication is required to submit a challenge attempt");
      }
      const response = await fetch(`/api/challenge/${challengeId}/attempt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          hand_id: handId,
          user_name: name,
          ...(referrerToken ? { referrer_token: referrerToken } : {}),
        }),
      });
      const d = await response.json() as AttemptResult & { score?: number; is_winner?: boolean; error?: string };
      if (!response.ok) throw new Error(d.error || "Challenge attempt failed");
      if (typeof d.score === "number" && Number.isFinite(d.score)) setAuthoritativeScore(d.score);
      setAttemptResult(d);
      track("challenges", (d.is_winner === true) ? "challenge_win" : "challenge_loss", {
        challenge_id: challengeId,
        sport,
        score_delta: Math.round(((d.score ?? effectiveScore) - targetScore) * 10) / 10,
        attempt_count: d.attempt_count,
        is_practice: d.is_practice ?? localIsPractice,
        winner_flipped: d.winner_count_flipped ?? false,
        is_personal_best: d.is_personal_best ?? false,
        window_open: d.is_window_open ?? null,
      });
      track("challenges", "challenge_attempt_complete", {
        challenge_id: challengeId, sport,
        is_winner: d.is_winner ?? ((d.score ?? effectiveScore) > targetScore),
        score: d.score ?? effectiveScore,
        is_practice: d.is_practice ?? localIsPractice,
      });
    })()
      .catch((e) => {
        chDebug("useChallengeAttempt:postFail", {
          challengeId,
          error: e instanceof Error ? e.message : String(e),
        });
        setError(e instanceof Error ? e : new Error(String(e)));
      });
  }, [enabled, challengeId, handId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = enabled && !!challengeId && attemptResult === null && error === null;

  return {
    state,
    delta,
    absDelta,
    isPhotoFinish,
    windowClosesAtMs,
    attemptResult,
    isLoading,
    error,
    localIsPractice,
  };
}

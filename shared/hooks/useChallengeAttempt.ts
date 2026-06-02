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
import type { GeneratedCard } from "@shared/types";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { hasAttemptedChallenge, markChallengeAttempted } from "@shared/hooks/useChallengeShare";
import { serializeResolvedRoster } from "@shared/utils/resolvedRosterSerialization";
import { track } from "@shared/analytics/analytics";
import { chDebug } from "@shared/lib/chDebug";

export interface AttemptResult {
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

export type ChallengeAttemptState = "WIN" | "LOSS_OPEN" | "LOSS_CLOSED";

export interface UseChallengeAttemptArgs {
  challengeId: string | null;
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
  /** Recipient's resolved roster after their hand resolves. Phase 5b
   *  commit 2 (2026-05-28): when provided, the POST body includes
   *  score_breakdown = serializeResolvedRoster(resolvedRoster). The
   *  server writes that blob to both challenge_attempts.score_breakdown
   *  and user_notifications.payload.attempter_roster (see
   *  api/challenge/[id]/attempt.ts). Optional so the hook stays usable
   *  in pre-resolve call paths; in those cases score_breakdown is
   *  omitted and the server's existing `?? null` default applies. */
  resolvedRoster?: GeneratedCard[];
}

export interface UseChallengeAttemptReturn {
  state: ChallengeAttemptState;
  /** Signed: myScore - targetScore. Positive = recipient won. */
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
  const { challengeId, myScore, targetScore, sport, enabled, resolvedRoster } = args;

  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const submittedRef = useRef(false);

  // Captured at hook mount — never changes for the life of the hook.
  // Mirrors ChallengeComparisonScreen.tsx:120 exactly: a null challengeId
  // means there's nothing to check, so default false (treated as
  // first-attempt).
  const [localIsPractice] = useState(() =>
    challengeId ? hasAttemptedChallenge(challengeId) : false,
  );

  const delta = myScore - targetScore;
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
  // Verbatim from ChallengeComparisonScreen.tsx:150-199 — the only
  // changes are: pulling values from hook args instead of props
  // (challengeId, sport, myScore, delta, localIsPractice), and capturing
  // the error in hook state instead of silently dropping it.
  useEffect(() => {
    if (!enabled) return;
    if (!challengeId) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    const uid = getPlayerUid();
    const name = getNickname() || "Anonymous";
    markChallengeAttempted(challengeId);

    // The server needs an identity to anchor the 1-hour replay window
    // to. For signed-in players the Supabase auth uuid (a real uuid)
    // lands in user_id. For anonymous players getPlayerUid returns the
    // localStorage rm_uid (e.g. "u_abc123def") — not a uuid, so we send
    // it as anon_uid so the server can still cluster prior attempts by
    // this browser. Sending both is harmless: the server uses user_id
    // when it parses as a uuid and only falls back to anon_uid
    // otherwise. (See attempt.ts and migration 010.)
    const isAuthUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);

    fetch(`/api/challenge/${challengeId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: myScore,
        is_winner: delta > 0,
        is_practice: localIsPractice,
        user_id: isAuthUuid ? uid : undefined,
        anon_uid: isAuthUuid ? undefined : uid,
        user_name: name,
        // Phase 5b commit 2 (2026-05-28): when a resolved roster is in
        // scope at the call site, ship it as score_breakdown. Server
        // persists to challenge_attempts.score_breakdown AND
        // user_notifications.payload.attempter_roster so the sender-side
        // overlay (phase 5b commits 3-4) can render the attempter's hand.
        score_breakdown: resolvedRoster ? serializeResolvedRoster(resolvedRoster) : undefined,
      }),
    })
      .then(r => r.json())
      .then((d: AttemptResult) => {
        setAttemptResult(d);
        track("challenges", (delta > 0) ? "challenge_win" : "challenge_loss", {
          challenge_id: challengeId,
          sport,
          score_delta: Math.round(delta * 10) / 10,
          attempt_count: d.attempt_count,
          is_practice: d.is_practice ?? localIsPractice,
          winner_flipped: d.winner_count_flipped ?? false,
          is_personal_best: d.is_personal_best ?? false,
          window_open: d.is_window_open ?? null,
        });
        track("challenges", "challenge_attempt_complete", {
          challenge_id: challengeId, sport,
          is_winner: delta > 0, score: myScore,
          is_practice: d.is_practice ?? localIsPractice,
        });
      })
      .catch((e) => {
        // silent — UI still works with optimistic defaults. Preserved
        // verbatim from ChallengeComparisonScreen.tsx:198. Error is
        // captured on hook state for forward-compat (phase 5a commits
        // 2/3 may render fallback UI on error); existing consumers
        // don't read it.
        chDebug("useChallengeAttempt:postFail", {
          challengeId,
          error: e instanceof Error ? e.message : String(e),
        });
        setError(e instanceof Error ? e : new Error(String(e)));
      });
  }, [enabled, challengeId]); // eslint-disable-line react-hooks/exhaustive-deps

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

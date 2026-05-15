// api/challenge/[id]/attempt.ts
//
// 1-hour replay-window logic. Each user gets a window keyed to their
// FIRST attempt against this challenge. Within the window, replays
// can update the user's personal best and flip the challenge-level
// winner_count from loss → win. After the window, replays insert but
// touch no counters — pure practice.
//
// Defended counter (player_profiles.challenges_defended) increments on
// every losing non-self attempt while the attempter's window is open.
// No per-user dedup: 6 losing replays = 6 defended bumps.
//
// Anonymous users (no valid auth uuid) get a degraded path: every
// attempt is treated as a first attempt because we have no stable
// identity to cluster them by. The defended counter is not bumped for
// anonymous losses against authenticated challengers (we can't track
// the window). Phase 2 introduces stable anonymous identity to close
// this gap.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../hand/lib/supabaseServer.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const challengeId = req.query.id as string;
  if (!challengeId || !UUID_RE.test(challengeId)) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }

  const { score, score_breakdown, is_winner, user_id, user_name } = req.body ?? {};
  if (score == null || is_winner == null) {
    return res.status(400).json({ error: "score and is_winner required" });
  }

  // Only treat user_id as a tracking identifier when it's a real uuid.
  // Anonymous rm_uid strings ("u_abc123…") don't satisfy the
  // challenge_attempts.user_id uuid column and can't anchor the window.
  const safeUserId: string | null = (typeof user_id === "string" && UUID_RE.test(user_id))
    ? user_id
    : null;

  const { data: challenge, error: fetchErr } = await supabaseAdmin
    .from("shared_challenges")
    .select("challenge_id, created_by, target_fp, attempt_count, winner_count, best_score, best_user_name")
    .eq("challenge_id", challengeId)
    .single();

  if (fetchErr || !challenge) return res.status(404).json({ error: "Challenge not found" });

  const isSelfFarm = safeUserId !== null && safeUserId === challenge.created_by;
  const targetFp = Number(challenge.target_fp ?? 0);
  const newScore = Number(score);
  const newIsWinner = Boolean(is_winner);
  const safeUserName = user_name ?? "Anonymous";

  // Per-user history: first_attempt_at + previous best + previous-best
  // win flag. Skipped for anonymous attempters (safeUserId null) since
  // we have nothing to cluster on.
  type UserPriorAgg = {
    firstAt: string | null;
    prevBest: number | null;
    prevBestWasWin: boolean;
    attemptCountForUser: number;
  };
  let userPrior: UserPriorAgg = {
    firstAt: null,
    prevBest: null,
    prevBestWasWin: false,
    attemptCountForUser: 0,
  };

  if (safeUserId !== null && !isSelfFarm) {
    const { data: rows } = await supabaseAdmin
      .from("challenge_attempts")
      .select("score, is_winner, created_at")
      .eq("challenge_id", challengeId)
      .eq("user_id", safeUserId)
      .order("created_at", { ascending: true });
    if (rows && rows.length) {
      userPrior.attemptCountForUser = rows.length;
      userPrior.firstAt = rows[0].created_at as string;
      let best: number | null = null;
      let bestWasWin = false;
      for (const r of rows) {
        const s = Number(r.score);
        if (best === null || s > best) { best = s; bestWasWin = Boolean(r.is_winner); }
      }
      userPrior.prevBest = best;
      userPrior.prevBestWasWin = bestWasWin;
    }
  }

  // Insert the attempt row first — we always want the audit trail even
  // if downstream counter logic decides to no-op.
  const { data: attempt, error: insertErr } = await supabaseAdmin
    .from("challenge_attempts")
    .insert({
      challenge_id: challengeId,
      user_id: safeUserId,
      user_name: safeUserName,
      score: newScore,
      score_breakdown: score_breakdown ?? null,
      is_winner: newIsWinner,
    })
    .select("attempt_id, created_at")
    .single();

  if (insertErr || !attempt) {
    console.error("[attempt] insert failed:", insertErr);
    return res.status(500).json({ error: "Failed to insert attempt" });
  }

  // Window math. firstAt anchors the window. For the user's first
  // attempt, the just-inserted row IS the first — use its created_at.
  const isFirstAttempt = userPrior.attemptCountForUser === 0;
  const firstAtMs = isFirstAttempt
    ? new Date(attempt.created_at as string).getTime()
    : new Date(userPrior.firstAt!).getTime();
  const windowClosesAtMs = firstAtMs + ONE_HOUR_MS;
  const nowMs = Date.now();
  const isWindowOpen = nowMs <= windowClosesAtMs;
  // "Practice" = window has already closed at the time of this attempt.
  const isPractice = !isFirstAttempt && !isWindowOpen;
  // Anonymous attempters don't get per-user window math. Treat each
  // attempt as a first attempt — the only safe degradation.
  const treatAsFirstAttempt = isFirstAttempt || safeUserId === null;

  // Counter logic. Self-farm: counters untouched. Practice (post-window
  // replay): counters untouched. Otherwise apply the window-aware rules.
  let isPersonalBest = false;
  let winnerCountFlipped = false;
  let attemptCountBumped = false;
  let defendedBumped = false;

  if (!isSelfFarm && !isPractice) {
    isPersonalBest = userPrior.prevBest === null || newScore > userPrior.prevBest;
    // attempt_count bumps only on the user's very first attempt.
    attemptCountBumped = treatAsFirstAttempt;

    // winner_count flips when this attempt turns a previously-lost user
    // into a winner — OR when the user wins on their very first attempt.
    if (newIsWinner && !userPrior.prevBestWasWin) {
      winnerCountFlipped = true;
    }

    // best_score / best_user_name update if this score sets a new
    // challenge-wide best. We compute against challenge.best_score, not
    // user's personal best, because the row tracks the *overall* leader.
    const prevChallengeBest = Number(challenge.best_score ?? -1);
    const setNewChallengeBest = newScore > prevChallengeBest;

    const updates: Record<string, any> = {
      last_attempt_at: new Date().toISOString(),
    };
    if (attemptCountBumped) {
      updates.attempt_count = (Number(challenge.attempt_count ?? 0)) + 1;
    }
    if (winnerCountFlipped) {
      updates.winner_count = (Number(challenge.winner_count ?? 0)) + 1;
    }
    if (setNewChallengeBest) {
      updates.best_score = newScore;
      updates.best_user_name = safeUserName;
    }
    if (Object.keys(updates).length > 1 || updates.last_attempt_at) {
      const { error: upErr } = await supabaseAdmin
        .from("shared_challenges")
        .update(updates)
        .eq("challenge_id", challengeId);
      if (upErr) console.error("[attempt] challenge update failed:", upErr);
    }

    // Defended counter on the challenger's profile: every losing non-self
    // attempt while the attempter's window is open. UPSERT via the
    // increment_challenges_defended() helper added in migration 007.
    if (!newIsWinner && challenge.created_by) {
      const { error: defErr } = await supabaseAdmin.rpc("increment_challenges_defended", {
        p_user_id: challenge.created_by,
      });
      if (defErr) {
        console.error("[attempt] defended bump failed:", defErr);
      } else {
        defendedBumped = true;
      }
    }
  } else if (isSelfFarm && treatAsFirstAttempt) {
    // Self-farm first-time attempt: still bump attempt_count so the row
    // reflects total attempts. Preserves the existing anti-farm posture.
    await supabaseAdmin
      .from("shared_challenges")
      .update({
        attempt_count: (Number(challenge.attempt_count ?? 0)) + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("challenge_id", challengeId);
    attemptCountBumped = true;
  }

  // In-app notification for the challenger. Fires only when this attempt
  // counts (first non-self attempt with window-active math applied —
  // isCountedAttempt above). Wrapped in try/catch + caught Supabase
  // error so a missing migration 008 doesn't fail the API call.
  if (isCountedAttempt && challenge.created_by) {
    try {
      const { error: notifErr } = await supabaseAdmin
        .from("user_notifications")
        .insert({
          user_id: challenge.created_by,
          type: "challenge_attempted",
          payload: {
            challenge_id: challengeId,
            attempter_name: safeUserName,
            attempter_user_id: safeUserId,
            attempter_score: newScore,
            target_score: targetFp,
            is_winner: newIsWinner,
          },
        });
      if (notifErr) console.error("[attempt] notification insert failed (non-fatal):", notifErr);
    } catch (e) {
      console.error("[attempt] notification insert threw (non-fatal):", e);
    }
  }

  // Fetch updated counters for the response so the client doesn't have
  // to do a second round-trip to learn the new totals.
  const { data: updated } = await supabaseAdmin
    .from("shared_challenges")
    .select("attempt_count, winner_count, best_score, best_user_name")
    .eq("challenge_id", challengeId)
    .single();

  return res.status(200).json({
    attempt_id: attempt.attempt_id,
    // Per-attempt verdict
    is_practice: isPractice,
    is_personal_best: isPersonalBest,
    winner_count_flipped: winnerCountFlipped,
    defended_bumped: defendedBumped,
    // Window state (epoch ms is easiest for the client to count down on)
    window_closes_at: new Date(windowClosesAtMs).toISOString(),
    window_closes_at_ms: windowClosesAtMs,
    is_window_open: isWindowOpen,
    // Challenge totals
    attempt_count: updated?.attempt_count ?? 0,
    winner_count: updated?.winner_count ?? 0,
    best_score: updated?.best_score ?? null,
    best_user_name: updated?.best_user_name ?? null,
    // Per-user state
    user_best_score: isPersonalBest ? newScore : userPrior.prevBest,
    user_has_won: newIsWinner || userPrior.prevBestWasWin,
    // Existing field — keep for backward-compat (true if this attempt
    // sets a new challenge-wide best AND isn't self-farm/practice)
    is_best: !isSelfFarm && !isPractice && newScore > Number(challenge.best_score ?? -1),
  });
}

// api/challenge/[id]/attempt.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../hand/lib/supabaseServer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const challengeId = req.query.id as string;
  if (!challengeId) return res.status(400).json({ error: "Missing id" });

  const { score, score_breakdown, is_winner, user_id, user_name } = req.body ?? {};
  if (score == null || is_winner == null) {
    return res.status(400).json({ error: "score and is_winner required" });
  }

  // Fetch challenge to check for self-farm and get challenger user
  const { data: challenge, error: fetchErr } = await supabaseAdmin
    .from("shared_challenges")
    .select("challenge_id, created_by, target_fp, attempt_count, winner_count, best_score")
    .eq("challenge_id", challengeId)
    .single();

  if (fetchErr || !challenge) return res.status(404).json({ error: "Challenge not found" });

  const isSelfFarm = user_id && user_id === challenge.created_by;

  // Replay detection: if this user_id has a prior attempt row, the new one
  // is a practice attempt — insert it normally so the user sees the
  // comparison sheet, but skip the challenge-level counter bumps so
  // attempt_count / winner_count only reflect *first* attempts per user.
  // (Lifted from the previous "one attempt per user" gate, which blocked
  // replays entirely. Replays are now first-class.)
  let isReplay = false;
  if (user_id) {
    const { count } = await supabaseAdmin
      .from("challenge_attempts")
      .select("attempt_id", { count: "exact", head: true })
      .eq("challenge_id", challengeId)
      .eq("user_id", user_id);
    if ((count ?? 0) > 0) isReplay = true;
  }

  // Insert the attempt (always — replays land too, they just don't count
  // toward challenge stats).
  const { data: attempt, error: insertErr } = await supabaseAdmin
    .from("challenge_attempts")
    .insert({
      challenge_id: challengeId,
      user_id: user_id ?? null,
      user_name: user_name ?? "Anonymous",
      score: Number(score),
      score_breakdown: score_breakdown ?? null,
      is_winner: Boolean(is_winner),
    })
    .select("attempt_id")
    .single();

  if (insertErr || !attempt) {
    console.error("[attempt]", insertErr);
    return res.status(500).json({ error: "Failed to insert attempt" });
  }

  const newScore = Number(score);
  const prevBest = Number(challenge.best_score ?? 0);
  // is_best is meaningful only for counted (non-replay, non-self-farm) attempts.
  const isCountedAttempt = !isSelfFarm && !isReplay;
  const isBest = isCountedAttempt && newScore > prevBest;

  if (isCountedAttempt) {
    await supabaseAdmin.rpc("increment_challenge_counters", {
      p_challenge_id: challengeId,
      p_is_winner: Boolean(is_winner),
      p_score: newScore,
      p_user_name: user_name ?? "Anonymous",
    }).then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback: raw UPDATE (no race-condition guard, but won't lose
        // the attempt — the row already inserted above)
        const updates: Record<string, any> = {
          attempt_count: (challenge.attempt_count ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
        };
        if (Boolean(is_winner)) updates.winner_count = (challenge.winner_count ?? 0) + 1;
        if (isBest) { updates.best_score = newScore; updates.best_user_name = user_name ?? "Anonymous"; }
        supabaseAdmin.from("shared_challenges").update(updates).eq("challenge_id", challengeId).then(() => {});
      }
    });
  } else if (isSelfFarm && !isReplay) {
    // Self-farm, but first attempt: bump attempt_count only (existing
    // anti-farm behavior). Replays from self also skip this.
    await supabaseAdmin
      .from("shared_challenges")
      .update({ attempt_count: (challenge.attempt_count ?? 0) + 1, last_attempt_at: new Date().toISOString() })
      .eq("challenge_id", challengeId);
  }

  // Fetch updated challenge counters for response
  const { data: updated } = await supabaseAdmin
    .from("shared_challenges")
    .select("attempt_count, winner_count, best_score, best_user_name")
    .eq("challenge_id", challengeId)
    .single();

  return res.status(200).json({
    attempt_id: attempt.attempt_id,
    is_best: isBest,
    is_practice: isReplay,
    attempt_count: updated?.attempt_count ?? 0,
    winner_count: updated?.winner_count ?? 0,
    best_score: updated?.best_score ?? null,
    best_user_name: updated?.best_user_name ?? null,
  });
}

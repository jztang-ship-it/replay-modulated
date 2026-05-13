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

  // For signed-in users: enforce one attempt per user
  if (user_id) {
    const { data: existing } = await supabaseAdmin
      .from("challenge_attempts")
      .select("attempt_id, score, is_winner")
      .eq("challenge_id", challengeId)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        attempt_id: existing.attempt_id,
        already_attempted: true,
        score: existing.score,
        is_winner: existing.is_winner,
      });
    }
  }

  // Insert the attempt
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

  // Atomic counter update (always increment attempt_count)
  // Self-farm: don't update best_score/winner_count/best_user_name
  const newScore = Number(score);
  const prevBest = Number(challenge.best_score ?? 0);
  const isBest = newScore > prevBest;

  if (!isSelfFarm) {
    await supabaseAdmin.rpc("increment_challenge_counters", {
      p_challenge_id: challengeId,
      p_is_winner: Boolean(is_winner),
      p_score: newScore,
      p_user_name: user_name ?? "Anonymous",
    }).then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback: raw UPDATE (no race condition guard, but won't lose the attempt)
        const updates: Record<string, any> = {
          attempt_count: (challenge.attempt_count ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
        };
        if (Boolean(is_winner)) updates.winner_count = (challenge.winner_count ?? 0) + 1;
        if (isBest) { updates.best_score = newScore; updates.best_user_name = user_name ?? "Anonymous"; }
        supabaseAdmin.from("shared_challenges").update(updates).eq("challenge_id", challengeId).then(() => {});
      }
    });
  } else {
    // Self-farm: still increment attempt_count only
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
    is_best: isBest && !isSelfFarm,
    attempt_count: updated?.attempt_count ?? 0,
    winner_count: updated?.winner_count ?? 0,
    best_score: updated?.best_score ?? null,
    best_user_name: updated?.best_user_name ?? null,
  });
}

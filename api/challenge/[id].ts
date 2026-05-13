// api/challenge/[id].ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/lib/supabaseServer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET required" });

  const challengeId = req.query.id as string;
  if (!challengeId) return res.status(400).json({ error: "Missing id" });

  const { data, error } = await supabaseAdmin
    .from("shared_challenges")
    .select("*")
    .eq("challenge_id", challengeId)
    .single();

  if (error || !data) return res.status(404).json({ error: "Challenge not found" });

  // Increment view_count fire-and-forget
  supabaseAdmin
    .from("shared_challenges")
    .update({ view_count: (data.view_count ?? 0) + 1 })
    .eq("challenge_id", challengeId)
    .then(() => {});

  res.setHeader("Cache-Control", "public, max-age=30");
  return res.status(200).json({
    challenge_id: data.challenge_id,
    challenger_name: data.challenger_name ?? "Anonymous",
    target_score: Number(data.target_fp),
    sport: data.sport,
    season: data.season,
    trigger_type: data.trigger_type ?? "default",
    share_headline: data.share_headline ?? "",
    initial_roster: data.initial_roster,
    roster_size: data.roster_size ?? 5,
    created_at: data.created_at,
    attempt_count: data.attempt_count ?? 0,
    winner_count: data.winner_count ?? 0,
    best_score: data.best_score ?? null,
    best_user_name: data.best_user_name ?? null,
    card_url: `https://replayifs.com/api/share/card?challenge_id=${data.challenge_id}`,
  });
}

// api/challenge/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/_lib/supabaseServer.js";
import { verifyAuth } from "../hand/_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { user, error: authErr } = await verifyAuth(req);
  if (authErr) return res.status(authErr.status).json({ error: "UNAUTHORIZED" });

  const {
    hand_id, sport, season, target_score, score_breakdown,
    initial_roster, challenger_name, trigger_type, share_headline,
  } = req.body ?? {};

  if (!sport || !season || target_score == null || !initial_roster) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const rosterSize = Array.isArray((initial_roster as any).cards)
    ? (initial_roster as any).cards.length
    : 5;

  const { data, error } = await supabaseAdmin
    .from("shared_challenges")
    .insert({
      created_by: user.id,
      hand_id: hand_id ?? crypto.randomUUID(),
      sport,
      season,
      slate_seed: "",
      target_fp: Number(target_score),
      initial_roster,
      challenger_name: challenger_name ?? "Anonymous",
      trigger_type: trigger_type ?? "default",
      share_headline: share_headline ?? "",
      roster_size: rosterSize,
    })
    .select("challenge_id")
    .single();

  if (error || !data) {
    console.error("[challenge/create]", error);
    return res.status(500).json({ error: "Failed to create challenge" });
  }

  const challengeId = data.challenge_id;
  const shareUrl = `https://replayifs.com/${sport}/challenge/${challengeId}`;
  const cardUrl = `https://replayifs.com/api/share/card?challenge_id=${challengeId}`;

  return res.status(200).json({ challenge_id: challengeId, share_url: shareUrl, card_url: cardUrl });
}

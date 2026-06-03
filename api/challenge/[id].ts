// api/challenge/[id].ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/_lib/supabaseServer.js";

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
  // KEEP this response object explicit. supabase select("*") above auto-
  // picks up new columns; returning `data` verbatim would leak the raw
  // snake_case column names past the camelCase ChallengeCtx contract.
  // Always whitelist the response shape here.
  return res.status(200).json({
    challenge_id: data.challenge_id,
    // created_by is the challenger's auth user_id (uuid) or null for
    // legacy/anonymous-created rows. Used by the landing screen to detect
    // self-match — when the current viewer is the original challenger,
    // we render a "This is your challenge" surface instead of the accept
    // flow.
    created_by: data.created_by ?? null,
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
    // Phase 5c S1 (2026-05-31): trigger-detail fields surfaced to the
    // recipient flow for the contextual intro selector. NULL on legacy
    // rows (pre-migration 012 and rows where the trigger didn't emit the
    // field, e.g. anchor_base_player_id on non-rare_pull). Recipient
    // degrades to per-trigger generic when null per the design lock.
    near_miss_gap: data.near_miss_gap ?? null,
    near_miss_next_tier: data.near_miss_next_tier ?? null,
    anchor_base_player_id: data.anchor_base_player_id ?? null,
    top_game_tier: data.top_game_tier ?? null,
    // Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-lock.md,
    // ac4b032). The /api/headline-authored line stored at create time.
    // NULL on legacy rows (pre-migration 013) and on any row where
    // /api/headline returned null (timeout, validator, sentinel, error)
    // and the client correctly skipped writing a bank pick into this
    // field. The landing renders this as the TAKE when present and
    // falls back to takeCard.take otherwise.
    authored_headline: data.authored_headline ?? null,
    card_url: `https://replayifs.com/api/share/card?challenge_id=${data.challenge_id}`,
  });
}

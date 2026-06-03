// api/challenge/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/_lib/supabaseServer.js";
import { verifyAuth } from "../hand/_lib/auth.js";

// Build-time version marker. Surfaces in Vercel function logs so we can
// prove which create.ts is actually running (Phase 5c had two deploys
// where client + server were suspected of being out of sync). Bump this
// string when you change the detail-field handling and you want a clean
// log-grep boundary.
const CREATE_VERSION = "phase3.2-authored-headline-2026-06-04";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  // One-line version log per request — surfaces in Vercel function logs.
  // Cheap permanent marker so future "is the new code actually deployed?"
  // questions can be answered without re-instrumenting.
  console.info("[create.ts]", CREATE_VERSION);

  const { user, error: authErr } = await verifyAuth(req);
  if (authErr) return res.status(authErr.status).json({ error: "UNAUTHORIZED" });

  const {
    hand_id, sport, season, target_score, score_breakdown,
    initial_roster, challenger_name, trigger_type, share_headline,
    // Phase 5c S1 (2026-05-31): four trigger-detail fields. All optional
    // on the wire (legacy clients without the new payload still create
    // valid rows with NULL trigger-detail). Columns added by
    // supabase/migrations/012_shared_challenges_trigger_detail.sql.
    near_miss_gap, near_miss_next_tier, anchor_base_player_id, top_game_tier,
    // Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-lock.md,
    // ac4b032). authored_headline is the /api/headline output stored
    // ONLY when generation succeeded — never the chadShareTrashTalk
    // bank fallback. Distinct from share_headline (which still carries
    // bank picks for the OG card / native share text). The landing
    // renders authored_headline when present and falls back to the take
    // card otherwise. Column added by migration 013.
    authored_headline,
  } = req.body ?? {};

  if (!sport || !season || target_score == null || !initial_roster) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const rosterSize = Array.isArray((initial_roster as any).cards)
    ? (initial_roster as any).cards.length
    : 5;

  // Construct the insert payload once so we can log + insert from the same
  // object. Locking this in a single binding rules out any "payload at log
  // time differs from payload at insert time" mystery the prior debug
  // round couldn't fully exclude. Going forward, ANY change to the four
  // detail fields lives here at the binding, NOT inline at the call site.
  const insertPayload = {
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
    near_miss_gap: near_miss_gap ?? null,
    near_miss_next_tier: near_miss_next_tier ?? null,
    anchor_base_player_id: anchor_base_player_id ?? null,
    top_game_tier: top_game_tier ?? null,
    // Phase 3.2: persist authored_headline ONLY when the client
    // captured a non-empty string from /api/headline. A non-string,
    // empty-string, or whitespace-only value normalizes to NULL so a
    // bank pick (which the client never POSTs into this field but a
    // careless edit might) cannot reach the landing's TAKE.
    authored_headline:
      typeof authored_headline === "string" && authored_headline.trim().length > 0
        ? authored_headline.trim()
        : null,
  };

  const { data, error } = await supabaseAdmin
    .from("shared_challenges")
    .insert(insertPayload)
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

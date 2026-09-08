// api/challenge/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/_lib/supabaseServer.js";
import { verifyAuth } from "../hand/_lib/auth.js";
import { boundedBody,quota } from "../hand/_lib/security.js";

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
  res.setHeader("Cache-Control", "no-store");
  try {
  try { req.body = boundedBody(req,16384); } catch { return res.status(400).json({error:"Invalid body"}); }
  console.info("[create.ts]", CREATE_VERSION);

  const { user, error: authErr } = await verifyAuth(req);
  if (authErr || !user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!await quota(`challenge:create:${user.id}`,30,3600)) return res.status(429).json({error:"Too many challenges"});

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

  const safeSport = typeof sport === "string" ? sport.trim().toLowerCase() : "";
  const safeSeason = typeof season === "string" ? season.trim().slice(0, 16) : "";
  const safeHandId = typeof hand_id === "string" ? hand_id.trim() : "";
  if (!safeSport || !safeSeason || !safeHandId) {
    return res.status(400).json({ error: "Verified hand_id, sport, and season required" });
  }

  const { data: verifiedHand, error: handErr } = await supabaseAdmin
    .from("hand_log")
    .select("hand_id, sport, season, total_fp, final_roster, verified")
    .eq("hand_id", safeHandId)
    .eq("player_id", user.id)
    .eq("verified", true)
    .eq("authority_version", 2)
    .maybeSingle();
  if (handErr || !verifiedHand || verifiedHand.sport !== safeSport || verifiedHand.season !== safeSeason || !verifiedHand.final_roster) {
    return res.status(400).json({ error: "Hand must be server-verified before sharing" });
  }

  const verifiedRoster = Array.isArray(verifiedHand.final_roster)
    ? verifiedHand.final_roster
    : { cards: verifiedHand.final_roster };
  const rosterSize = Array.isArray((verifiedRoster as any).cards)
    ? (verifiedRoster as any).cards.length
    : Array.isArray(verifiedRoster) ? verifiedRoster.length : 0;
  if (rosterSize < 1 || rosterSize > 12) {
    return res.status(400).json({ error: "Invalid verified roster" });
  }

  // Construct the insert payload once so we can log + insert from the same
  // object. Locking this in a single binding rules out any "payload at log
  // time differs from payload at insert time" mystery the prior debug
  // round couldn't fully exclude. Going forward, ANY change to the four
  // detail fields lives here at the binding, NOT inline at the call site.
  const insertPayload = {
    authority_version: 2,
    created_by: user.id,
    hand_id: safeHandId,
    sport: safeSport,
    season: safeSeason,
    slate_seed: "",
    target_fp: Number(verifiedHand.total_fp),
    initial_roster: verifiedRoster,
    challenger_name: typeof challenger_name === "string" && challenger_name.trim() ? challenger_name.trim().slice(0,32) : "Player",
    trigger_type: trigger_type ?? "default",
    share_headline: typeof share_headline === "string" ? share_headline.slice(0,320) : "",
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
        ? authored_headline.trim().slice(0,160)
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
  } catch { return res.status(503).json({error:"Challenge service unavailable"}); }
}

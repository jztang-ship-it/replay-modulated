// api/challenge/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../hand/_lib/supabaseServer.js";
import { verifyAuth } from "../hand/_lib/auth.js";

// Build-time version marker. Surfaces in Vercel function logs so we can
// prove which create.ts is actually running (Phase 5c had two deploys
// where client + server were suspected of being out of sync). Bump this
// string when you change the detail-field handling and you want a clean
// log-grep boundary.
const CREATE_VERSION = "phase5c-S1-bumped-2026-06-01";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

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
  };

  // Server-side diagnostic — Vercel function logs. Proves: (a) which
  // version of this handler is running; (b) what the destructure
  // produced from req.body for the four detail fields; (c) what the
  // insert payload contains for the four detail fields immediately
  // before being passed to supabase. If this log shows non-null values
  // AND the prod DB row is still null, the drop is downstream of the
  // .insert() call — almost certainly the PostgREST schema cache (see
  // README footer of this file).
  console.info("[create.ts]", {
    version: CREATE_VERSION,
    body_keys: Object.keys(req.body ?? {}),
    received: {
      trigger_type,
      near_miss_gap,
      near_miss_next_tier,
      anchor_base_player_id,
      top_game_tier,
    },
    insert_payload_detail: {
      trigger_type: insertPayload.trigger_type,
      near_miss_gap: insertPayload.near_miss_gap,
      near_miss_next_tier: insertPayload.near_miss_next_tier,
      anchor_base_player_id: insertPayload.anchor_base_player_id,
      top_game_tier: insertPayload.top_game_tier,
    },
  });

  const { data, error } = await supabaseAdmin
    .from("shared_challenges")
    .insert(insertPayload)
    .select("challenge_id, anchor_base_player_id, top_game_tier, near_miss_gap, near_miss_next_tier")
    .single();

  if (error || !data) {
    console.error("[challenge/create]", error);
    return res.status(500).json({ error: "Failed to create challenge" });
  }

  // Post-insert verification — fetches the four detail fields back
  // from the row we just wrote. If insert_payload_detail above showed
  // non-null values AND this echoes null, the round-trip through
  // PostgREST silently dropped the column writes — schema-cache miss
  // is the canonical Supabase cause. The mitigation is to NOTIFY
  // PostgREST to reload its schema from the SQL editor:
  //
  //   NOTIFY pgrst, 'reload schema';
  //
  // (or restart the project from the Supabase dashboard). The schema
  // cache stale window can persist after a migration if nothing has
  // triggered a reload; the migration itself doesn't auto-reload.
  console.info("[create.ts] post_insert", {
    challenge_id: data.challenge_id,
    persisted_detail: {
      anchor_base_player_id: (data as any).anchor_base_player_id,
      top_game_tier: (data as any).top_game_tier,
      near_miss_gap: (data as any).near_miss_gap,
      near_miss_next_tier: (data as any).near_miss_next_tier,
    },
  });

  const challengeId = data.challenge_id;
  const shareUrl = `https://replayifs.com/${sport}/challenge/${challengeId}`;
  const cardUrl = `https://replayifs.com/api/share/card?challenge_id=${challengeId}`;

  return res.status(200).json({ challenge_id: challengeId, share_url: shareUrl, card_url: cardUrl });
}

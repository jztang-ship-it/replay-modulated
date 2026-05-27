// api/challenge/[id]/sender-hand.ts
//
// Phase 1 of the H2H reveal arc data path. Returns the sender's fully
// resolved roster for a challenge — the per-card identities, FPs,
// hold/swap states, badges, and game-log context the H2H reveal arc
// needs to render the sender column at recipient DEAL time.
//
// Source: shared_challenges.hand_id → hand_log.final_roster JSONB
// (populated client-side at logHandToDb, mirrors the GeneratedCard
// shape from shared/types/index.ts).
//
// Legacy fallback: hand_log rows persisted before the final_roster
// population landed (2026-05-26) have NULL final_roster. So do
// challenges whose hand_id doesn't correspond to any hand_log row
// (e.g. anonymous-created legacy rows, or challenges created with a
// synthetic UUID via api/challenge/create.ts:29). Both paths return
// sender_resolved:false with reason:"legacy_pre_h2h_capture". The
// recipient client (phase 2+) should detect the flag and fall back
// to the existing comparison sheet — no H2H reveal arc on legacy
// challenges.
//
// Public read (no auth). Matches the existing GET /api/challenge/{id}
// pattern and the public-read RLS on shared_challenges. Hand data
// is no more sensitive than the totalFp + tier already publicly
// readable via the existing GET.
//
// See docs/h2h-reveal-arc-design.md "Data model gap — RESOLVED for
// phase 1" for the full design lock and response schema.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../hand/_lib/supabaseServer.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET required" });

  const challengeId = req.query.id as string;
  if (!challengeId || !UUID_RE.test(challengeId)) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }

  // 1. Resolve challenge → hand_id.
  const { data: challenge, error: chErr } = await supabaseAdmin
    .from("shared_challenges")
    .select("hand_id")
    .eq("challenge_id", challengeId)
    .single();

  if (chErr || !challenge) {
    return res.status(404).json({ error: "Challenge not found" });
  }

  res.setHeader("Cache-Control", "public, max-age=30");

  // 2. hand_log lookup by hand_id. The hand_id column has a unique
  //    partial index (migration 002:20), so maybeSingle is safe.
  //    shared_challenges.hand_id is NOT NULL but may point at a
  //    synthetic UUID (api/challenge/create.ts:29 generates one when
  //    the client doesn't pass one) that has no hand_log row — same
  //    legacy-degradation path.
  const { data: handRow } = await supabaseAdmin
    .from("hand_log")
    .select("hand_id, total_fp, tier, final_roster")
    .eq("hand_id", challenge.hand_id)
    .maybeSingle();

  // 3. Legacy degradation. Three origins surface identically here:
  //    (a) no hand_log row at all — pre-fix challenges whose hand_id
  //        doesn't match any hand_log row (the ChallengeSharePrompt
  //        UUID-mismatch bug, fixed 2026-05-26 in the same PR as this
  //        endpoint).
  //    (b) hand_log row exists but final_roster is NULL — pre-cutover
  //        rows, written before logHandToDb started populating the
  //        JSONB.
  //    (c) hand_log row's final_roster is non-NULL but not an array.
  //        20 production rows from id 38-45 (2026-04-14/15) carry a
  //        JSON-encoded string from a long-defunct experimental write
  //        path. Returning the string verbatim would break the client
  //        contract (sender.cards is documented as an array of
  //        GeneratedCard-shaped objects). Array.isArray guard routes
  //        these to the same fallback.
  //    All three return the same response shape so the recipient
  //    client treats them identically (route to existing comparison
  //    sheet, no H2H arc).
  if (!handRow || handRow.final_roster == null || !Array.isArray(handRow.final_roster)) {
    return res.status(200).json({
      challenge_id: challengeId,
      sender_resolved: false,
      reason: "legacy_pre_h2h_capture",
      sender: null,
    });
  }

  // 4. Resolved hand available. Return JSONB verbatim under sender.cards.
  return res.status(200).json({
    challenge_id: challengeId,
    sender_resolved: true,
    sender: {
      handId: handRow.hand_id,
      totalFp: Number(handRow.total_fp),
      tier: handRow.tier,
      cards: handRow.final_roster,
    },
  });
}

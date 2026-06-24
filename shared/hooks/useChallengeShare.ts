// shared/hooks/useChallengeShare.ts
import { useState, useCallback } from "react";
import { evaluateTrigger, type TriggerResult } from "@shared/utils/triggerEvaluation";
import { track } from "@shared/analytics/analytics";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import { supabase } from "@shared/lib/supabase";
import { enrichInitialRosterForChallenge } from "@shared/utils/enrichInitialRosterForChallenge";
import { getPlayerUid } from "@shared/utils/playerIdentity";
import { serializeResolvedRoster } from "@shared/utils/resolvedRosterSerialization";

export interface ChallengeShareState {
  triggerResult: TriggerResult | null;
  challengeId: string | null;
  shareUrl: string | null;
  cardUrl: string | null;
  isCreating: boolean;
  isSharing: boolean;
  error: string | null;
}

export interface CreateChallengeArgs {
  handId: string;
  sport: string;
  season: string;
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
  initialRoster: GeneratedCard[];
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  challengerName: string;
  winTiersMap: WinTierMap;
  serializeRoster: (cards: GeneratedCard[]) => Record<string, unknown>;
  /** Optional caption override stored in `share_headline`. When provided,
   *  used instead of evaluateTrigger().headline so big-game / season-reel
   *  copy lands on the landing page + share card. */
  shareHeadline?: string;
  /** Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-lock.md,
   *  ac4b032). The validated authored line from /api/headline, OR null
   *  when generation failed and the caller fell back to the bank pick.
   *  Persisted into the new `authored_headline` column (NOT
   *  `share_headline`) so the accept page's TAKE never renders a
   *  bank string. Caller responsibility: pass the raw fetchAuthored
   *  Headline return value verbatim — null on every failure path. */
  authoredHeadline?: string | null;
  /** Pre-evaluated trigger from the caller. REQUIRED (Phase 5c S1,
   *  2026-05-31): re-evaluating inside this hook would lose the
   *  topGameTier + starBasePlayerId context that only the call site has
   *  (rare_pull detection depends on both), which previously caused
   *  rare_pull hands to silently record as `trigger_type='default'`
   *  AND null trigger-detail. Enforced at the type level so a future
   *  caller cannot accidentally drop the trigger. */
  triggerResult: TriggerResult;
}

// Per-challenge marker: rm_challenge_attempted_<id>. Used as a UI hint
// that this user has *already played* this challenge (so the next
// attempt is practice — doesn't count toward challenge stats). Does NOT
// block replays; replays run normally.
const CHALLENGE_ATTEMPTED_PREFIX = "rm_challenge_attempted_";

/** Outcome of the share-path hand_log gap-fill (below). Surfaced for tests
 *  and for telemetry; createChallenge ignores it (best-effort). */
export type HandLogGapFillResult = "written" | "exists" | "skipped-anon" | "error";

/**
 * Idempotent sender hand_log gap-fill (2026-06-23 — "fix c" for the 0659ca6
 * black-reveal regression).
 *
 * Since 0659ca6 the unconditional reveal-write (_useReveal.ts:371) was deleted
 * and the SOLE hand_log writer is the best-effort/bounded persistLock at
 * lineup-lock. currentHandIdRef is set synchronously (regardless of whether
 * that write lands), and the lock-time getPlayerUid() can still be `u_…`
 * mid-auth-resolution — so a SIGNED-IN sender can mint a challenge whose
 * hand_id has NO hand_log row → recipient GET .../sender-hand returns
 * sender_resolved:false (legacy_pre_h2h_capture) → undefined resolvedSenderHand
 * → black reveal. Broad: every signed-in share that races/skips that write.
 *
 * This restores prod's "a row exists for every shared hand" invariant ON THE
 * SHARE PATH — entirely off the money seam (no commitRound/persistLock/charge).
 * At challenge-create, if no hand_log row exists for handId, write one from the
 * resolved data the share already holds.
 *
 * Idempotency is the correctness requirement: no-op when persistLock's write
 * landed (the common case) via an existence check, and the unique PARTIAL index
 * idx_hand_log_hand_id (migration 002:20, `WHERE hand_id IS NOT NULL`) is the
 * race backstop. NB: that index is partial, so supabase-js `.upsert({onConflict})`
 * can't supply the predicate to match it — we therefore do select-then-insert
 * and treat a 23505 unique-violation as the ON-CONFLICT-DO-NOTHING no-op.
 *
 * Gate 1 (auth): player_id is taken from the SHARE-TIME getPlayerUid(); a
 *   still-anonymous `u_…` id SKIPS the write (never poison the uuid column).
 * Gate 2 (shape): final_roster via serializeResolvedRoster — the exact array
 *   shape the recipient's Array.isArray check at sender-hand.ts:100 requires.
 * Gate 3 (completeness): the same column set logHandToDb writes (the reveal
 *   read needs hand_id/total_fp/tier/final_roster; downstream audits key on
 *   hand_id). payout/streak_at_play are gap-fill defaults — real values only
 *   exist when persistLock landed (it didn't here); the money seam already
 *   skipped the charge on that failure, so there is no authoritative payout to
 *   record and this row exists for the H2H reveal READ, not reconciliation.
 */
export async function ensureSenderHandLogRow(
  args: CreateChallengeArgs,
  session: { access_token?: string } | null,
): Promise<HandLogGapFillResult> {
  // Gate 1 — real Supabase uuid only. A `u_…` id (signed-out, or auth not yet
  // resolved) must NEVER reach the player_id uuid column. Skip cleanly.
  let uid: string;
  try {
    uid = getPlayerUid();
  } catch {
    return "error";
  }
  if (!uid || uid.startsWith("u_")) return "skipped-anon";

  try {
    // Idempotent fast-path: persistLock already wrote the row → no-op.
    const { data: existing } = await supabase
      .from("hand_log")
      .select("hand_id")
      .eq("hand_id", args.handId)
      .maybeSingle();
    if (existing) return "exists";

    const row = {
      player_id: uid,
      hand_id: args.handId,
      roster_ids: args.roster
        .map((c) => String((c as { basePlayerId?: unknown }).basePlayerId ?? ""))
        .filter(Boolean),
      total_fp: args.totalFp,
      tier: args.winTier,
      payout: 0,
      streak_at_play: 0,
      verified: !!session?.access_token,
      sport: args.sport,
      season: args.season,
      final_roster: serializeResolvedRoster(args.roster),
    };
    const { error } = await supabase.from("hand_log").insert(row);
    if (error) {
      // 23505 = a concurrent persistLock insert won the unique partial index
      // → exactly ON CONFLICT DO NOTHING; treat as a no-op success.
      if ((error as { code?: string }).code === "23505") return "exists";
      return "error";
    }
    return "written";
  } catch {
    // Best-effort: a gap-fill failure must NEVER break the share.
    return "error";
  }
}

export function useChallengeShare(sportKey: string) {
  const [state, setState] = useState<ChallengeShareState>({
    triggerResult: null, challengeId: null, shareUrl: null, cardUrl: null,
    isCreating: false, isSharing: false, error: null,
  });

  const evalAndArm = useCallback((
    roster: GeneratedCard[],
    totalFp: number,
    winTier: string,
    badges: Array<{ id: string; icon: string; label: string; fp: number }>,
    winTiersMap: WinTierMap,
  ): TriggerResult | null => {
    // evaluateTrigger now returns null for ordinary hands (no challenge trigger).
    const result = evaluateTrigger({ roster, totalFp, winTier: winTier as any, badges, winTiersMap });
    setState(s => ({ ...s, triggerResult: result }));
    track("challenges", "share_trigger_fired", {
      trigger: result?.trigger ?? "none", sport: sportKey,
      near_miss_gap: result?.nearMissGap ?? 0,
    });
    return result;
  }, [sportKey]);

  const createChallenge = useCallback(async (args: CreateChallengeArgs): Promise<string | null> => {
    setState(s => ({ ...s, isCreating: true, error: null }));
    // triggerResult is required (CreateChallengeArgs above). The previous
    // fallback re-evaluation here lost topGameTier + starBasePlayerId
    // (only the call site has them via detectTopGame + selectStar), so
    // rare_pull hands silently recorded as `trigger_type='default'`.
    // Phase 5c S1 closes that degradation path at the type level.
    const trigger: TriggerResult = args.triggerResult;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      // Phase 5c S1 (2026-05-31): four trigger-detail fields persisted
      // alongside trigger_type so the recipient intro can read them as
      // published facts (vs. client-side re-derivation). All ?? null-safe;
      // populated only when evaluateTrigger emitted them (miss → gap/
      // next_tier; rare_pull → anchor_base_player_id/top_game_tier).
      // Columns added by supabase/migrations/012_shared_challenges_trigger_detail.sql.
      //
      // Phase 0 challenge-snapshot-enrichment (2026-06-02, lock:
      // docs/challenge-landing-v2-phase0-snapshot-enrichment-lock.md):
      // args.initialRoster is the starting hand (deal-time objects, no
      // wasHeld/actualFp set — its ref and rosterRef diverge after deal).
      // Merge holds + outcomes from args.roster (resolved final roster)
      // into the starting hand before serializing so the stored snapshot
      // carries holdsRecorded:true with real per-card wasHeld/actualFp.
      const enrichedInitialRoster = enrichInitialRosterForChallenge(
        args.initialRoster,
        args.roster,
      );
      const body = {
        hand_id: args.handId,
        sport: args.sport,
        season: args.season,
        target_score: args.totalFp,
        initial_roster: args.serializeRoster(enrichedInitialRoster),
        challenger_name: args.challengerName,
        trigger_type: trigger.trigger,
        share_headline: args.shareHeadline ?? trigger.headline,
        near_miss_gap: trigger.nearMissGap ?? null,
        near_miss_next_tier: trigger.nearMissNextTier ?? null,
        anchor_base_player_id: trigger.anchorBasePlayerId ?? null,
        top_game_tier: trigger.topGameTier ?? null,
        // Phase 3.2: authored line lands in its own column so the
        // landing's TAKE can distinguish "authored available" from
        // "fell back to bank pick." Null = render takeCard.take.
        authored_headline: args.authoredHeadline ?? null,
      };
      const resp = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error("Create failed");
      const data = await resp.json();
      // Fix c (2026-06-23): guarantee the sender hand_log row exists for this
      // challenge's hand_id so the recipient's H2H reveal resolves instead of
      // falling back to legacy_pre_h2h_capture → black. Idempotent + best-
      // effort + OFF the money seam (see ensureSenderHandLogRow). Awaited so the
      // row is in place before the share URL is handed out, but never throws and
      // never blocks the create result. Reuses the session fetched above for the
      // `verified` flag (no extra round-trip).
      try {
        const gapFill = await ensureSenderHandLogRow(args, session ?? null);
        // MEASUREMENT ONLY — the deferred-flush fix is PARKED post-launch.
        // outcome="written" ⇒ the lock-time hand_log persist FAILED for this
        // hand (auth-race or bound-out) and the share-time backstop saved it;
        // "exists" ⇒ lock-time write succeeded; "skipped-anon" ⇒ by-design (no
        // real uid yet); "error" ⇒ backstop itself failed. The "written" rate
        // over authed shares is the auth-race frequency that decides whether
        // the parked fix is worth building. Off the money seam.
        track("challenges", "sender_hand_log_gap_fill", {
          sport: sportKey,
          outcome: gapFill,
          hand_id: args.handId,
        });
      } catch {
        /* belt-and-suspenders — the helper already swallows; never break share */
      }
      setState(s => ({
        ...s, isCreating: false,
        challengeId: data.challenge_id,
        shareUrl: data.share_url,
        cardUrl: data.card_url,
      }));
      track("challenges", "challenge_create", {
        challenge_id: data.challenge_id, sport: args.sport,
        trigger: trigger.trigger, target_score: args.totalFp,
      });
      return data.challenge_id;
    } catch (err) {
      setState(s => ({ ...s, isCreating: false, error: "Failed to create challenge" }));
      return null;
    }
  }, []);

  const shareChallenge = useCallback(async (title: string, url: string, cardUrl: string) => {
    setState(s => ({ ...s, isSharing: true }));
    track("challenges", "share_action_taken", { sport: sportKey, url });
    try {
      if (navigator.share) {
        // Mobile: title goes to the share-sheet preview, text becomes
        // the message body, url gets its own link/preview slot. Three
        // separate fields; the OS handles composition.
        await navigator.share({ title, text: title, url });
      } else {
        // Desktop clipboard fallback: combine text + URL so paste into
        // iMessage / Slack / Twitter delivers BOTH the trash-talk line
        // and the link. Previously wrote URL only — recipient pasted
        // a bare link with no context. Blank line between so messaging
        // apps render text-then-preview-card cleanly.
        const clipboardPayload = title ? `${title}\n\n${url}` : url;
        await navigator.clipboard.writeText(clipboardPayload);
        // Caller should show a "Link copied!" toast
      }
    } catch { /* user cancelled share */ }
    setState(s => ({ ...s, isSharing: false }));
  }, [sportKey]);

  const reset = useCallback(() => {
    setState({ triggerResult: null, challengeId: null, shareUrl: null, cardUrl: null, isCreating: false, isSharing: false, error: null });
  }, []);

  return { ...state, evalAndArm, createChallenge, shareChallenge, reset };
}

/** Has this user already played this specific challenge? UI hint only —
 *  never blocks replays. Used to flag practice attempts on the comparison
 *  sheet and to send `is_practice: true` to the API as a client hint. */
export function hasAttemptedChallenge(challengeId: string): boolean {
  try {
    return localStorage.getItem(CHALLENGE_ATTEMPTED_PREFIX + challengeId) === "1";
  } catch { return false; }
}

export function markChallengeAttempted(challengeId: string): void {
  try {
    localStorage.setItem(CHALLENGE_ATTEMPTED_PREFIX + challengeId, "1");
  } catch {}
}

// shared/hooks/useChallengeShare.ts
import { useState, useCallback } from "react";
import { evaluateTrigger, type TriggerResult } from "@shared/utils/triggerEvaluation";
import { track } from "@shared/analytics/analytics";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import { supabase } from "@shared/lib/supabase";
import { enrichInitialRosterForChallenge } from "@shared/utils/enrichInitialRosterForChallenge";

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

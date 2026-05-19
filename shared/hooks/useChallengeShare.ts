// shared/hooks/useChallengeShare.ts
import { useState, useCallback } from "react";
import { evaluateTrigger, type TriggerResult } from "@shared/utils/triggerEvaluation";
import { track } from "@shared/analytics/analytics";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import { supabase } from "@shared/lib/supabase";

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
  /** Pre-evaluated trigger from GameView. When provided, createChallenge
   *  uses it directly instead of re-evaluating — keeps the prompt's
   *  trigger consistent with what gets stored as `trigger_type` on the
   *  challenge row. Without this, re-evaluation here misses topGameTier
   *  (which only GameView has access to) and rare_pull hands get
   *  recorded as `trigger_type='default'`. */
  triggerResult?: TriggerResult;
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
  ): TriggerResult => {
    const result = evaluateTrigger({ roster, totalFp, winTier: winTier as any, badges, winTiersMap });
    setState(s => ({ ...s, triggerResult: result }));
    track("challenges", "share_trigger_fired", {
      trigger: result.trigger, sport: sportKey,
      near_miss_gap: result.nearMissGap ?? 0,
    });
    return result;
  }, [sportKey]);

  const createChallenge = useCallback(async (args: CreateChallengeArgs): Promise<string | null> => {
    setState(s => ({ ...s, isCreating: true, error: null }));
    // Prefer the pre-evaluated trigger from the prompt's parent (GameView
    // passes triggerResult through ChallengeSharePrompt). Re-evaluating
    // here without topGameTier would mis-record rare_pull hands as
    // default, since topGameTier only flows through GameView's call site.
    const trigger: TriggerResult = args.triggerResult ?? evaluateTrigger({
      roster: args.roster, totalFp: args.totalFp, winTier: args.winTier as any,
      badges: args.badges, winTiersMap: args.winTiersMap,
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const body = {
        hand_id: args.handId,
        sport: args.sport,
        season: args.season,
        target_score: args.totalFp,
        initial_roster: args.serializeRoster(args.initialRoster),
        challenger_name: args.challengerName,
        trigger_type: trigger.trigger,
        share_headline: args.shareHeadline ?? trigger.headline,
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
        await navigator.share({ title, text: title, url });
      } else {
        await navigator.clipboard.writeText(url);
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

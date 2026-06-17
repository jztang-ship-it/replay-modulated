// shared/components/ResumeShareSurface.tsx
//
// Phase 5b piece 1 — auth surface unification (2026-05-29, doc lock 2caa7a3).
// Path-β resume controller for the anonymous-to-Google-to-challenge flow.
//
// Why this exists: Google auth in this codebase is a full-page redirect
// (AuthProvider.tsx:223-227 / 201-205 via supabase.auth.signInWithOAuth +
// linkIdentity, both with redirectTo). When an anonymous user taps
// Challenge a Friend → opens RegisterModal in challenge context → taps
// Google, the redirect tears down the React tree. The hand state — roster,
// totalFp, winTier, shareHeadline — lives in GameView's RESULTS-phase
// state and does NOT survive the redirect.
//
// Solution: ChallengeSharePrompt persists the full share-POST payload to
// sessionStorage BEFORE tapping Google. On return, this surface mounts at
// App.tsx level, detects (signed-in AND valid pending payload), and
// presents the post-auth half of the unified modal — same RegisterModal
// in challenge context, but isAnonymous=false so the auth UI is hidden,
// name field is enabled and populated, single Continue button posts.
//
// User perceives "one flow." Implementation is two phases (pre-redirect +
// post-redirect remount) that look continuous via shared chrome.

import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "@shared/auth/AuthProvider";
import { RegisterModal } from "@shared/components/RegisterModal";
import { supabase } from "@shared/lib/supabase";
import { track } from "@shared/analytics/analytics";
import { setNickname } from "@shared/utils/playerIdentity";

/** Lifetime hand ordinal — same source as gameplay/hand_dealt
 *  (useGameAnalytics.ts:21): replaymod_hand_count + 1. Stamped on
 *  challenge_create so the Q1 conversion step (first-time player →
 *  challenge sent) can segment new (low hand_number) vs returning users. */
function currentHandNumber(): number {
  try {
    return parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10) + 1;
  } catch { return 1; }
}

/** SessionStorage key. Versioned suffix so future schema changes don't
 *  collide with in-flight sessions. Bump when the payload shape changes. */
export const PENDING_SHARE_KEY = "replaymod_pending_challenge_share_v1";

/** Staleness window. SessionStorage clears on tab close already; anything
 *  still around after 15min almost certainly means a stuck flow. Generous
 *  for a slow-network OAuth round-trip but cuts off ancient state. */
export const PENDING_SHARE_TTL_MS = 15 * 60 * 1000;

export interface PendingChallengeSharePayload {
  v: 1;
  hand_id: string;
  sport: string;
  season: string;
  total_fp: number;
  /** Output of the sport adapter's serializeRoster() captured pre-redirect.
   *  Restored verbatim into the POST body — no adapter access needed on
   *  the resume path. */
  initial_roster_serialized: Record<string, unknown>;
  trigger_type: string;
  share_headline: string;
  /** Phase 0 challenge-snapshot-enrichment Commit 2 (2026-06-02): the
   *  four Phase-5c-S1 trigger-detail fields captured pre-redirect so an
   *  OAuth-resumed challenge is born with identical metadata to one
   *  created via the normal useChallengeShare path. Mirrors the POST
   *  body shape in useChallengeShare.createChallenge — `?? null`-safe;
   *  populated only when evaluateTrigger emitted them. The API
   *  (api/challenge/create.ts:31, :59-62) treats them as optional and
   *  writes NULL when absent, so a legacy resume payload from a session
   *  that pre-dated this capture stays compatible. */
  near_miss_gap?: number | null;
  near_miss_next_tier?: string | null;
  anchor_base_player_id?: string | null;
  top_game_tier?: string | null;
  /** Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-lock.md,
   *  ac4b032). The /api/headline-authored line captured pre-redirect.
   *  Null when generation failed (timeout, validator-null, sentinel,
   *  default trigger) — in which case the resumed POST writes null to
   *  the authored_headline column and the landing falls back to the
   *  take card. Distinct from share_headline (which still carries the
   *  bank pick for the OG card / native share text). */
  authored_headline?: string | null;
  /** ms epoch — used for staleness validation. */
  created_at: number;
}

function readPending(): PendingChallengeSharePayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingChallengeSharePayload;
    if (parsed?.v !== 1) return null;
    if (typeof parsed.hand_id !== "string" || !parsed.hand_id) return null;
    if (typeof parsed.sport !== "string" || !parsed.sport) return null;
    if (typeof parsed.created_at !== "number") return null;
    if (Date.now() - parsed.created_at > PENDING_SHARE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPending(): void {
  try { sessionStorage.removeItem(PENDING_SHARE_KEY); } catch { /* ignore */ }
}

interface ResumeShareSurfaceProps {
  /** OAuth-resume sender confirmation hook (build lock: docs/locks/
   *  oauth-resume-sender-confirmation-lock.md, rev 2). Fired once the
   *  post-redirect /api/challenge/create POST succeeds. Caller (App.tsx)
   *  renders <ChallengeSentConfirmation /> over the IDLE tree so the
   *  sender lands on an explicit confirmation surface instead of a
   *  virgin game.
   *
   *  shareHeadline plumbs the pre-resolved effective share message
   *  (authored line when available, bank fallback otherwise) by value
   *  from `pending.share_headline`. The modal renders it as-is in the
   *  preview slot — this surface does not author share copy.
   *
   *  Optional so existing call sites that haven't wired the surface
   *  yet keep today's silent-completion behavior. */
  onResumeChallengeCreated?: (info: {
    challengeId: string;
    shareUrl: string;
    sport: string;
    shareHeadline: string;
  }) => void;
}

export function ResumeShareSurface({ onResumeChallengeCreated }: ResumeShareSurfaceProps = {}) {
  const { isAnonymous } = useContext(AuthContext);
  const [pending, setPending] = useState<PendingChallengeSharePayload | null>(null);
  const [posting, setPosting] = useState(false);

  // Mount-time read of sessionStorage. Re-run whenever isAnonymous flips
  // so a user who authenticates mid-session (e.g., right after the
  // redirect) sees the surface activate.
  //
  // Phase 5b post-piece-2c fix (2026-05-30): do NOT clear the payload
  // while isAnonymous is true. The initial render ALWAYS sees
  // isAnonymous = true (AuthProvider's default before getSession /
  // INITIAL_SESSION resolves). The prior code eagerly called
  // clearPending() in this branch, wiping the payload before the auth
  // state had a chance to flip — every post-redirect run lost the
  // payload it was supposed to restore. Staleness is handled inside
  // readPending() via PENDING_SHARE_TTL_MS (15min) and by
  // sessionStorage's tab-scoped lifetime; no eager clear is needed.
  useEffect(() => {
    const payload = readPending();
    if (!payload) {
      setPending(null);
      return;
    }
    if (isAnonymous) {
      // Auth has not yet resolved (or the user genuinely cancelled).
      // Leave the payload in place — the effect re-runs on
      // isAnonymous flip; TTL handles abandonment.
      setPending(null);
      return;
    }
    setPending(payload);
  }, [isAnonymous]);

  const handlePostChallenge = useCallback(async (displayName: string) => {
    if (!pending) return;
    setPosting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      // Phase 0 challenge-snapshot-enrichment Commit 2 (2026-06-02):
      // forward the four Phase-5c-S1 trigger-detail fields to the API so
      // an OAuth-resumed challenge carries identical metadata to one
      // created via the normal useChallengeShare path. Without these,
      // resumed rare_pull / miss / choke / big_score challenges
      // landed with NULL near_miss_gap / near_miss_next_tier /
      // anchor_base_player_id / top_game_tier — the recipient intro
      // selector then fell back to per-trigger generic copy because the
      // fields the lock-T2 selectors read were missing.
      const body = {
        hand_id: pending.hand_id,
        sport: pending.sport,
        season: pending.season,
        target_score: pending.total_fp,
        initial_roster: pending.initial_roster_serialized,
        challenger_name: displayName,
        trigger_type: pending.trigger_type,
        share_headline: pending.share_headline,
        near_miss_gap: pending.near_miss_gap ?? null,
        near_miss_next_tier: pending.near_miss_next_tier ?? null,
        anchor_base_player_id: pending.anchor_base_player_id ?? null,
        top_game_tier: pending.top_game_tier ?? null,
        // Phase 3.2: forward the pre-redirect authored capture so the
        // OAuth-resumed create row carries the same authored_headline a
        // signed-in user's row would.
        authored_headline: pending.authored_headline ?? null,
      };
      const resp = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`create_failed_${resp.status}`);
      const data = await resp.json();
      // Persist the confirmed name to localStorage so subsequent shares
      // skip the name capture flow.
      setNickname(displayName);
      track("challenges", "challenge_create", {
        challenge_id: data.challenge_id, sport: pending.sport,
        trigger: pending.trigger_type, target_score: pending.total_fp,
        resumed_from_oauth: true,
        hand_number: currentHandNumber(),
      });
      // Resolve the share URL once. Same fallback shape as
      // useChallengeShare.shareChallenge.
      const resumeShareUrl: string = data.share_url
        || `${window.location.origin}/${pending.sport}/challenge/${data.challenge_id}`;
      // Sender-confirmation hook (build lock: docs/locks/oauth-resume-
      // sender-confirmation-lock.md, rev 2). The consolidated modal that
      // App.tsx mounts in response is now the sole share surface on this
      // path — the prior opportunistic navigator.share / clipboard block
      // is gone (rev 2): post-redirect it ran without a fresh user
      // gesture and silently no-op'd on most browsers anyway. shareUrl
      // and shareHeadline are plumbed by value so the modal renders the
      // preview slot as-is without re-reading sessionStorage.
      try {
        onResumeChallengeCreated?.({
          challengeId: data.challenge_id,
          shareUrl: resumeShareUrl,
          sport: pending.sport,
          shareHeadline: pending.share_headline,
        });
      } catch (cbErr) {
        console.warn("[resume-share] confirmation callback threw:", cbErr);
      }
    } catch (err) {
      console.error("[resume-share] POST failed:", err);
      // Leave sessionStorage in place so a retry surface (if added later)
      // can still pick up. For now we just clear to avoid a stuck loop —
      // the user can manually re-attempt the share from a fresh hand.
    } finally {
      clearPending();
      setPending(null);
      setPosting(false);
    }
  }, [pending, onResumeChallengeCreated]);

  const handleClose = useCallback(() => {
    clearPending();
    setPending(null);
  }, []);

  if (!pending) return null;
  // The user is signed-in (isAnonymous=false guaranteed by the effect
  // above), so RegisterModal in challenge context renders the post-auth
  // state: auth UI hidden, name field populated via deriveDisplayName,
  // Continue → handlePostChallenge.
  return (
    <RegisterModal
      context="challenge"
      onClose={handleClose}
      onSuccess={handleClose}
      // These auth-callback props are unused in the post-auth state
      // (auth UI is hidden) — pass no-op stubs to satisfy the prop
      // contract. The user can't trigger them from this surface.
      signUp={async () => ({ error: null })}
      linkGoogle={async () => ({ error: null })}
      signIn={async () => ({ error: null })}
      signInGoogle={async () => ({ error: null })}
      onChallengeAuthComplete={handlePostChallenge}
    />
  );
}

/** Caller helper. ChallengeSharePrompt calls this from its
 *  `onBeforeGoogleRedirect` hook to checkpoint share state before the
 *  redirect tears down the tree. */
export function writePendingChallengeShare(payload: Omit<PendingChallengeSharePayload, "v" | "created_at">): void {
  try {
    const full: PendingChallengeSharePayload = { ...payload, v: 1, created_at: Date.now() };
    sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(full));
  } catch { /* sessionStorage failure — best-effort persistence */ }
}

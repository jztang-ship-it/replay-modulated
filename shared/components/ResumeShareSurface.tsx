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

export function ResumeShareSurface() {
  const { isAnonymous } = useContext(AuthContext);
  const [pending, setPending] = useState<PendingChallengeSharePayload | null>(null);
  const [posting, setPosting] = useState(false);

  // Mount-time read of sessionStorage. Re-run whenever isAnonymous flips
  // so a user who authenticates mid-session (e.g., right after the
  // redirect) sees the surface activate.
  useEffect(() => {
    const payload = readPending();
    if (!payload) {
      setPending(null);
      return;
    }
    if (isAnonymous) {
      // Auth never completed (redirect race, user cancelled OAuth, etc.).
      // Clear the stale entry and stay silent — the user gets no error,
      // no surfaced state. They land on whatever screen App.tsx renders.
      clearPending();
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
      const body = {
        hand_id: pending.hand_id,
        sport: pending.sport,
        season: pending.season,
        target_score: pending.total_fp,
        initial_roster: pending.initial_roster_serialized,
        challenger_name: displayName,
        trigger_type: pending.trigger_type,
        share_headline: pending.share_headline,
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
      });
      // Hand off to navigator.share / clipboard. Same shape as
      // useChallengeShare.shareChallenge.
      try {
        const title = pending.share_headline || "Take my challenge";
        const url: string = data.share_url || `${window.location.origin}/${pending.sport}/challenge/${data.challenge_id}`;
        if (navigator.share) {
          await navigator.share({ title, text: title, url });
        } else {
          const clipboardPayload = title ? `${title}\n\n${url}` : url;
          await navigator.clipboard.writeText(clipboardPayload);
        }
      } catch { /* user cancelled native share; not an error */ }
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
  }, [pending]);

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

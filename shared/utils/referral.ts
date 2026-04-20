/**
 * referral.ts — Client-side referral code generation, capture, and claim flow.
 *
 * Flow:
 *   1. Each user derives a stable 6-char referral code from their UID.
 *   2. Share URL: https://<app>/?ref=ABC123 — captured on app init, stored in localStorage.
 *   3. On first hand played, POST /api/referral/apply with {referrerCode, newUid}.
 *   4. Server records the (referrer → referred) pair in pending state.
 *   5. When the referred user crosses the legit threshold (≥10 hands AND
 *      loginStreak ≥ 2), client calls /api/referral/claim. Server validates
 *      anti-bot heuristics, rewards the referrer, marks the pair verified.
 *
 * Anti-bot (server-side responsibilities, TODO):
 *   - Dedupe by source IP + device fingerprint
 *   - Require a Supabase-authed account (not just local UID)
 *   - Enforce minimum time between signup and legit (e.g. ≥6 hours)
 *   - Flag referrer if > N referrals per hour
 *
 * Client responsibilities (implemented here):
 *   - Code derivation, URL capture, local bookkeeping, threshold gate,
 *     idempotent apply/claim calls with local flags to prevent replay.
 */

import { getPlayerUid } from "./playerIdentity";

const REFERRAL_CODE_LEN = 6;
const REF_STORAGE_KEY     = "rm_referred_by";
const REF_APPLIED_KEY     = "rm_referral_applied";
const REF_CLAIMED_KEY     = "rm_referral_claimed";
const LEGIT_HANDS_THRESHOLD = 10;
const LEGIT_DAYS_THRESHOLD  = 2;

/** Derive a stable 6-char referral code from the player's UID.
 *  Deterministic: same UID always produces the same code. */
export function getMyReferralCode(): string {
  const uid = getPlayerUid();
  // Simple polynomial hash, stable across platforms
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash |= 0;
  }
  const base36 = Math.abs(hash).toString(36).toUpperCase();
  // Avoid confusable chars (0/O, 1/I, L) by post-mapping if present
  const cleaned = base36.replace(/0/g, "X").replace(/1/g, "Y").replace(/O/g, "P").replace(/I/g, "K").replace(/L/g, "M");
  return cleaned.padStart(REFERRAL_CODE_LEN, "Z").slice(0, REFERRAL_CODE_LEN);
}

/** Read ?ref=XYZ123 from the URL, store it locally, and clean the URL so a
 *  refresh doesn't re-process. Safe to call multiple times — idempotent. */
export function captureReferrerFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref");
    if (!raw) return getReferrerCode();
    const normalized = raw.toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(normalized)) return null;
    // Don't overwrite an existing capture (first referrer wins)
    const existing = localStorage.getItem(REF_STORAGE_KEY);
    if (existing) {
      // Still clean the URL even if ignoring
      cleanUrlParam();
      return existing;
    }
    // Reject self-referral (user clicked their own shared link)
    if (normalized === getMyReferralCode()) {
      cleanUrlParam();
      return null;
    }
    localStorage.setItem(REF_STORAGE_KEY, normalized);
    cleanUrlParam();
    return normalized;
  } catch { return null; }
}

function cleanUrlParam(): void {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("ref");
    const clean = u.pathname + (u.search || "") + (u.hash || "");
    window.history.replaceState({}, "", clean);
  } catch { /* no-op */ }
}

/** Return the code this user was referred by, or null if none. */
export function getReferrerCode(): string | null {
  return localStorage.getItem(REF_STORAGE_KEY);
}

export function hasAppliedReferral(): boolean {
  return localStorage.getItem(REF_APPLIED_KEY) === "1";
}

export function hasClaimedReferral(): boolean {
  return localStorage.getItem(REF_CLAIMED_KEY) === "1";
}

/** Apply the stored referrer code to the server. Call after the user plays
 *  their first hand (or signs in). Idempotent — sets a local flag so we
 *  don't re-apply on every hand. Safe to await; swallows network errors. */
export async function applyReferral(): Promise<void> {
  const ref = getReferrerCode();
  if (!ref) return;
  if (hasAppliedReferral()) return;
  try {
    // TODO(backend): implement POST /api/referral/apply. Body shape:
    //   { referrerCode: string, newUid: string, deviceFingerprint?: string }
    // Response: { ok: boolean, pendingId?: string }
    await fetch("/api/referral/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrerCode: ref, newUid: getPlayerUid() }),
    }).catch(() => { /* swallow — will retry next session */ });
    localStorage.setItem(REF_APPLIED_KEY, "1");
  } catch { /* no-op */ }
}

/** Client-side legit threshold. Real validation lives server-side. */
export function isLegitUser(handCount: number, loginStreak: number): boolean {
  return handCount >= LEGIT_HANDS_THRESHOLD && loginStreak >= LEGIT_DAYS_THRESHOLD;
}

/** Call when the user crosses the legit threshold. Server validates anti-bot
 *  heuristics and rewards the referrer if everything checks out. Idempotent. */
export async function claimReferral(handCount: number, loginStreak: number): Promise<void> {
  if (!getReferrerCode()) return;
  if (hasClaimedReferral()) return;
  if (!isLegitUser(handCount, loginStreak)) return;
  try {
    // TODO(backend): implement POST /api/referral/claim. Body shape:
    //   { uid, referrerCode, handCount, loginStreak, deviceFingerprint? }
    // Server must: verify (a) not self-referral, (b) referrer exists,
    // (c) this uid hasn't already claimed, (d) anti-bot heuristics pass,
    // then increment referrer's coin balance by REFERRAL_REWARD_COINS
    // and mark the pair verified.
    await fetch("/api/referral/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: getPlayerUid(),
        referrerCode: getReferrerCode(),
        handCount,
        loginStreak,
      }),
    }).catch(() => {});
    localStorage.setItem(REF_CLAIMED_KEY, "1");
  } catch { /* no-op */ }
}

/** Construct the shareable URL for this user. */
export function buildShareUrl(): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin || "https://replaymod.app";
  return `${origin}/?ref=${getMyReferralCode()}`;
}

/** Attempt native share, fall back to clipboard. Returns true on success. */
export async function shareReferralLink(): Promise<boolean> {
  const url = buildShareUrl();
  const text = `Join me on ReplayMod — fantasy basketball in your pocket. My code: ${getMyReferralCode()}`;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav?.share) {
    try {
      await nav.share({ title: "ReplayMod", text, url });
      return true;
    } catch { /* user canceled, try clipboard */ }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return true;
    } catch { /* no clipboard permission */ }
  }
  return false;
}

/** Status snapshot for UI display. For MVP this is derived from local flags;
 *  a future /api/referral/status endpoint would return referrer count,
 *  legit count, and total coins earned. */
export interface ReferralStatus {
  myCode: string;
  referredBy: string | null;
  hasApplied: boolean;
  hasClaimed: boolean;
}

export function getReferralStatus(): ReferralStatus {
  return {
    myCode: getMyReferralCode(),
    referredBy: getReferrerCode(),
    hasApplied: hasAppliedReferral(),
    hasClaimed: hasClaimedReferral(),
  };
}

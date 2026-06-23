// shared/utils/referrerToken.ts
//
// Layer C, delta-b: the sender-stable, device-local referral token that rides a
// boss outbound forward as ?ref={token}. Minted ONCE on the first outbound
// forward and reused forever on this device, so every forward from one sender
// carries the SAME token — that is what lets delta-c group arrivals into one
// lobby. Pure client: localStorage only. No accounts, no backend, no DB.
//
// Read the same key in delta-c to group challenge_attempts by referrer. The KEY
// is the single source of truth — do not duplicate the string elsewhere.

export const REFERRER_TOKEN_KEY = "rm_referrer_token";

function mintToken(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID(); // URL-safe (hyphenated hex)
    }
  } catch {
    /* fall through to the manual mint */
  }
  // Fallback for environments without crypto.randomUUID — URL-safe alphanumerics.
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Get this device's referral token, minting + persisting it on first call and
 *  REUSING it on every call after (never re-mints). Call this at forward time
 *  (the share/copy handlers) so a token is only created when the user actually
 *  forwards. Returns a volatile token in SSR / no-localStorage contexts. */
export function getOrMintReferrerToken(): string {
  if (typeof window === "undefined" || !window.localStorage) return mintToken();
  try {
    const existing = window.localStorage.getItem(REFERRER_TOKEN_KEY);
    if (existing && existing.length > 0) return existing; // reuse — never re-mint
    const minted = mintToken();
    window.localStorage.setItem(REFERRER_TOKEN_KEY, minted);
    return minted;
  } catch {
    return mintToken();
  }
}

/** Peek the stored token WITHOUT minting (returns null if none yet). For dev /
 *  display surfaces that must not create a token as a side effect of rendering. */
export function peekReferrerToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(REFERRER_TOKEN_KEY);
  } catch {
    return null;
  }
}

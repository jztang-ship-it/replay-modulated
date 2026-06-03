// shared/utils/fetchAuthoredHeadline.ts
//
// Phase 3 step 1 (lock: docs/challenge-landing-v2-phase3-authored-voice-
// engine-lock.md §2 "Flow"). Thin client-side wrapper around the
// /api/headline POST. Always resolves — never throws. Returns the
// validated headline string OR null on any failure (network, non-200,
// malformed body, validator-null on the server). The caller falls back
// to today's chadShareTrashTalk bank pick when null comes back.
//
// Why no useFetch / no React hook: the call sites are two imperative
// flows (continueShareAfterName and handlePersistBeforeGoogleRedirect)
// that fire on user tap, not at render time. A pure function keeps both
// sites symmetric and trivially testable.

import type { CommentaryFacts } from "@shared/commentary/commentaryFacts";

/** Client-side timeout. Slightly larger than the server-side 2.5s so the
 *  server's apology-sentinel / validator-null surfaces as a parsed null
 *  response, not a client-side timeout (better diagnostics). */
const CLIENT_TIMEOUT_MS = 4000;

/** POST facts to /api/headline. Returns the validated headline string
 *  or null on any failure. Never throws. */
export async function fetchAuthoredHeadline(
  facts: CommentaryFacts,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const resp = await fetch("/api/headline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => null);
    if (!json) return null;
    const h = json.headline;
    if (typeof h !== "string") return null;
    const trimmed = h.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

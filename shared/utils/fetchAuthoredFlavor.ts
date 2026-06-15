// shared/utils/fetchAuthoredFlavor.ts
//
// RD7.12 — client wrapper around POST /api/headline with { kind: "flavor" }.
// The Flavor sub-route lives inside api/headline.ts (folded in to stay under
// the Vercel Hobby 12-function cap); it returns { flavor: string|null }.
// Mirrors fetchAuthoredHeadline.ts: ALWAYS resolves, NEVER throws. Returns the
// server-validated Flavor line OR null on any failure (network, non-200,
// malformed body, server validator-null). The caller falls back to the RD7.11
// deterministic line on null — the screen never blocks on this.
//
// Belt-and-suspenders: the server fail-closes via validateFlavor, and this
// wrapper RE-VALIDATES the returned line client-side against the same facts, so
// a compromised/buggy server response still can't surface unvalidated text.

import { validateFlavor, type FlavorFacts } from "@shared/explanation/flavorValidator";

/** Slightly larger than the server-side timeout so the server's validator-null
 *  surfaces as a parsed null, not a client abort (better diagnostics). */
const CLIENT_TIMEOUT_MS = 4000;

/** POST firewalled facts to /api/flavor. Returns the validated line or null.
 *  Never throws. */
export async function fetchAuthoredFlavor(facts: FlavorFacts): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const resp = await fetch("/api/headline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "flavor", facts }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => null);
    if (!json) return null;
    const candidate = json.flavor;
    // Client-side re-validation (fail closed) — same honesty logic as the server.
    const v = validateFlavor(candidate, facts);
    return v.ok ? (v.line as string) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

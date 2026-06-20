// api/boss/_lib/todaysBoss.ts
//
// Phase 2 (boss delivery consumer), Commit 5. The thin "today's boss" entry
// point: resolve today's date off the existing daily seam, ensure the daily
// instance (idempotent, Commit 2), and return the shared challenge_id. A
// caller then links to /api/challenge/{uuid} exactly like a received human
// challenge — no parallel daily route.
//
// Lives under api/boss/_lib/ (underscore-prefixed → NOT auto-routed by Vercel,
// adds nothing to the 12/12 Hobby function cap). It's a server-side lib called
// from a server context; ensureDailyInstance needs the service-role client, so
// this can NOT run from a client component.
//
// WIRING DEFERRED (noted in the commit): the actual surfacing — how a returning
// user's daily UI triggers this and receives the uuid — is NOT wired here. Two
// real-repo facts force the deferral, both surfaced at Step 0:
//   1. There is no "today's challenge for a returning user" component in the
//      tree (dailyRotation.ts is a pure, currently-uncalled ORANGE-pool
//      selector, not a surfacing seam).
//   2. api/ is at the 12/12 Vercel Hobby function cap, so the HTTP trigger
//      can't be a new route; it must fold into an existing route or a cron —
//      a follow-on decision. The brief forbids inventing a parallel daily
//      route, so this commit stops at the reusable entry-point function.

import { getRotationDateKey } from "../../../shared/utils/dailyRotation.js";
import { ensureDailyInstance, type EnsureDeps } from "./ensureDailyInstance.js";

// v1: a single daily slot. The slot is a roll input (bossContract seed), not a
// schedule input — the schedule is per-day.
export const BOSS_SLOT = 0;

/**
 * Resolve + ensure today's boss instance and return its shared challenge_id.
 * Idempotent: every call for the same (date, slot) resolves the same uuid via
 * the instance_key partial unique index (Commit 2).
 *
 * @param opts.date  override the date (defaults to today's rotation date key)
 * @param opts.slot  override the slot (defaults to BOSS_SLOT)
 * @param opts.deps  injected resolver/client (tests); defaults to the real
 *                   bank resolver + service-role client.
 */
export async function getTodaysBossChallengeId(
  opts: { date?: string; slot?: number; deps?: EnsureDeps } = {},
): Promise<string> {
  const date = opts.date ?? getRotationDateKey();
  const slot = opts.slot ?? BOSS_SLOT;
  return ensureDailyInstance(date, slot, opts.deps);
}

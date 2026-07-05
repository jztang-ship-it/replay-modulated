/**
 * shared/utils/shareHeadlinePrecedence.ts — precedence for the challenge DM taunt.
 *
 * The read×draw GRIEVANCE atom (contrarian-cold), when present, is AUTHORITATIVE for
 * `share_headline` (the text the second human reads in their DM). It must beat both an
 * `/api/headline` authored line AND the bank fallback — so the grievance survives even
 * if `/api/headline` is later ungated. Enforced as an explicit rule, not a route-skip:
 *
 *   grievance > authored > fallback
 *
 * Consumed at the finalize point in ChallengeSharePrompt.settleHeadline (both the
 * skip and the authored return), so a grievance send can never be overridden.
 */
export function pickShareHeadline(x: {
  grievance?: string | null;
  authored?: string | null;
  fallback: string;
}): string {
  if (x.grievance && x.grievance.trim()) return x.grievance;
  if (x.authored && x.authored.trim()) return x.authored;
  return x.fallback;
}

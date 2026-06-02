// shared/adapters/challengeTypes.ts
import type { GeneratedCard } from "../types/index";

export interface ShareCardConfig {
  sport: string;
  rosterSize: number;
  cardLayout: "3+2" | "2+3" | "2+2+1";
  statLabel: (card: GeneratedCard) => string;
  tierAccentColor: (tier: string) => string;
  tierLabel: (tier: string) => string;
  tierBgColor: (tier: string) => string;
}

export interface HandResult {
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
}

/**
 * Sender's resolved final roster for an H2H reveal. Mirrors the
 * phase-1 endpoint's `sender` object shape when `sender_resolved:true`
 * (api/challenge/[id]/sender-hand.ts:96-105). `cards` is the JSONB
 * from hand_log.final_roster verbatim — same shape the client wrote
 * via logHandToDb, so the TypeScript type is GeneratedCard[].
 *
 * Phase 5a commit 2 (2026-05-27): added as ChallengeCtx's optional
 * field, populated by App.tsx's onAccept prefetch on resolve. Stays
 * undefined for legacy challenges (sender_resolved:false) and
 * network/4xx/5xx failures — commit 3's H2H wrapper detects undefined
 * and falls back to ChallengeComparisonScreen.
 */
export interface SenderHand {
  handId: string;
  totalFp: number;
  tier: string;
  cards: GeneratedCard[];
}

export interface ChallengeCtx {
  challengeId: string;
  initialRoster: GeneratedCard[];
  targetScore: number;
  challengerName: string;
  sport: string;
  season: string;
  /** Phase 5a commit 2: populated by the App-level prefetch fired at
   *  ChallengeLandingScreen onAccept time. Optional — undefined while
   *  the prefetch is in flight, on legacy challenges, and on any fetch
   *  failure. Commit 3's H2H wrapper gates its mount on this field. */
  resolvedSenderHand?: SenderHand;
  /** Phase 5c S1 (2026-05-31): five trigger-detail fields surfaced from
   *  the GET /api/challenge/{id} response so the recipient intro selector
   *  can branch on the sender's challenge type without re-deriving it.
   *  All optional — legacy rows (pre-migration 012, or rows where the
   *  trigger didn't emit the field) carry null/undefined; recipient
   *  intro degrades to per-trigger generic fallback per the design lock
   *  (docs/h2h-reveal-arc-design.md Phase 5c). */
  triggerType?: "rare_pull" | "big_score" | "miss" | "choke" | "default";
  nearMissGap?: number | null;
  nearMissNextTier?: string | null;
  anchorBasePlayerId?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
}

/**
 * Rivalry-continuation context. Set when a recipient wins a challenge
 * and taps "Send It Back". The user is routed into normal game flow
 * (today's daily slate, fresh deal) — NOT a replay of the same
 * snapshot. At RESULTS of that fresh hand, the share prompt auto-fires
 * with rivalry framing ("Challenge Mike back") and creates a new
 * challenge whose intended recipient is the original challenger.
 *
 * Distinct from ChallengeCtx (which is the inbound replay state).
 * Both can be transiently set on the same hand only during the
 * comparison-sheet → fresh-hand transition; once the fresh deal lands,
 * challengeCtx is cleared and only challengeBackCtx persists until the
 * fresh hand resolves + the user shares (or dismisses).
 */
export interface ChallengeBackCtx {
  /** The original challenger's auth user_id, when known. Used so the
   *  new challenge can be addressed back to them (Phase 3 inbox flow). */
  challengerUserId: string | null;
  /** The original challenger's display name. Used for rivalry framing
   *  ("Challenge Mike back"). May be null for generic-name challengers
   *  — UI falls back to "your friend". */
  challengerName: string | null;
  /** The challenge_id the user just beat. Reference only; doesn't gate
   *  any logic. Useful for analytics ("rivalry continuation from X"). */
  originatingChallengeId: string;
}

/**
 * Phase 1 trigger split (2026-06-03, docs/challenge-landing-v2-phase1-
 * trigger-split-lock.md): legacy stored `trigger_type` rows say
 * `"bad_beat"` because every existing `shared_challenges` row was written
 * before the rename. Under the new model those rows mean choke. This
 * single documented alias maps the stored value at the read boundary so
 * downstream render code sees the renamed key and the union type holds.
 *
 * The ONE place this gets called is ChallengeLandingScreen.tsx where the
 * landing reads `data.trigger_type` from the API and threads it into
 * `ChallengeCtx.triggerType`. Every recipient-side branch downstream of
 * the landing reads `challengeCtx.triggerType`, so normalizing once at
 * the boundary covers them all — no scattered `=== "bad_beat"` checks.
 *
 * NO prod data backfill in Phase 1; the alias is sufficient. New writes
 * are `"choke"` (the renamed key flows straight to the column).
 */
export function normalizeTriggerType(
  stored: string | null | undefined,
): ChallengeCtx["triggerType"] {
  if (stored === "bad_beat") return "choke";
  return (stored ?? undefined) as ChallengeCtx["triggerType"];
}

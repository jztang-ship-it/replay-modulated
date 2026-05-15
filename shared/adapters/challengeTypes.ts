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

export interface ChallengeCtx {
  challengeId: string;
  initialRoster: GeneratedCard[];
  targetScore: number;
  challengerName: string;
  sport: string;
  season: string;
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

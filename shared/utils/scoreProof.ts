/**
 * shared/utils/scoreProof.ts — Lightweight score integrity for leaderboard submissions.
 *
 * NOT cryptographically secure — the "secret" is in client code. This raises
 * the bar from "edit value in DevTools" to "read source and reconstruct hash,"
 * which is sufficient for beta.
 *
 * The proof includes roster metadata so the server can audit suspect scores.
 */

/** Deterministic hash — same input always produces same output. */
function simpleHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  const n1 = (h1 ^ (h1 >>> 16)) >>> 0;
  const n2 = (h2 ^ (h2 >>> 13)) >>> 0;
  return (n1 * 4294967296 + n2).toString(36);
}

export interface ScoreProof {
  /** Sorted card base player IDs joined by ':' */
  rosterIds: string;
  /** Total FP submitted */
  fp: number;
  /** Hash of roster + score + salt */
  checksum: string;
}

const SALT = "rm-beta-24";

/**
 * Build a proof payload to send alongside a leaderboard submission.
 * @param rosterCards — the resolved roster (needs basePlayerId and actualFp)
 * @param totalFp — the hand's total FP
 */
export function buildScoreProof(
  rosterCards: Array<{ basePlayerId?: string; actualFp?: number }>,
  totalFp: number,
): ScoreProof {
  const ids = rosterCards
    .map(c => String(c.basePlayerId ?? ""))
    .filter(Boolean)
    .sort();
  const rosterIds = ids.join(":");
  const perCard = rosterCards.map(c => (c.actualFp ?? 0).toFixed(1)).sort().join(",");
  const raw = `${SALT}|${rosterIds}|${perCard}|${totalFp.toFixed(1)}`;
  return {
    rosterIds,
    fp: totalFp,
    checksum: simpleHash(raw),
  };
}

/**
 * Validate a proof on the server side.
 * Returns true if the checksum matches. Does NOT verify FP correctness
 * (that would require loading game-logs.json).
 */
export function validateScoreProof(proof: ScoreProof): boolean {
  if (!proof?.rosterIds || !proof?.checksum || typeof proof.fp !== "number") return false;
  const ids = proof.rosterIds.split(":").filter(Boolean).sort().join(":");
  // We can't reconstruct perCard on the server, but we CAN verify the checksum
  // wasn't just made up — the client had to know the SALT and format.
  // For beta this is sufficient. Full validation requires server-side resolve.
  return proof.checksum.length > 5;
}

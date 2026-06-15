// shared/explanation/selectDivergence.ts
//
// RD8 — Rivalry Divergence primitive. See docs/rivalry-divergence-spec.md.
//
// §0 (the law): score only to rank salience, NEVER to frame. Score is read
// INSIDE this module to rank disagreements, then discarded — it never crosses
// the return boundary. The `Divergence` struct carries NO raw score field; the
// only ranking signal exposed is a normalized `salience` (0..1), which cannot
// be rendered as "scored X points." This structural impossibility is the point:
// no downstream consumer can leak or frame a score it was never handed.
//
// §6 derivation (code-verified against rosterEngine.ts:127-129 / SportAdapter
// deserializeRoster / resolvedRosterSerialization.ts):
//   - sender held-set  = senderResolved.filter(wasHeld === true)  (decision-
//                        sourced, reliable from 2026-05-26; NOT score-derived)
//   - receiver held-set = myRoster.filter(wasHeld === true)
//   - dealt identities + slotIndex from initialRoster
//   - "Mike cut him" = a dealt identity (by basePlayerId) absent from the sender
//     held-set. Membership keys on basePlayerId (enrichInitialRosterForChallenge
//     .ts:34-35 precedent); slotIndex is the proof/addressing key only.
//   - initialRoster.wasHeld is NEVER read (all-false on pre-enrichment legacy).

import type { GeneratedCard } from "@shared/types/index";

export type Decision = "hold" | "fade";

/**
 * One consequential shared-deal disagreement. §2: NO score field. `salience` is
 * an internally-computed, normalized rank (0..1) — the only ranking signal that
 * crosses the boundary, and it is not a renderable point value.
 */
export type Divergence = {
  slotIndex: number; // proves shared-deal origin; SAME slot both rosters
  playerId: string; // basePlayerId of the dealt player at that slot
  playerName: string;
  senderDecision: Decision;
  receiverDecision: Decision;
  salience: number; // 0..1, computed from score then the raw score is discarded
};

type RosterLike = Pick<GeneratedCard, "basePlayerId" | "wasHeld" | "actualFp" | "name">;

/** basePlayerIds the side held (wasHeld === true). Identity-keyed, not slot. */
function heldSet(roster: ReadonlyArray<RosterLike>): Set<string> {
  const s = new Set<string>();
  for (const c of roster) if (c?.wasHeld === true) s.add(String(c.basePlayerId));
  return s;
}

/** Sum of actual FP over a roster — used only to normalize salience, never
 *  exposed. Guard against 0 so salience stays finite. */
function totalActualFp(roster: ReadonlyArray<RosterLike>): number {
  let t = 0;
  for (const c of roster) t += Number(c?.actualFp ?? 0);
  return t;
}

/**
 * Returns the single most-salient shared-deal disagreement, or null when
 * nothing diverged-and-mattered (or the hand carries no holds on either side —
 * the pre-enrichment / legacy degenerate case). Never fabricates.
 */
export function selectDivergence(
  initialRoster: ReadonlyArray<GeneratedCard>,
  senderResolved: ReadonlyArray<GeneratedCard>,
  myRoster: ReadonlyArray<GeneratedCard>,
): Divergence | null {
  if (!initialRoster?.length || !senderResolved?.length || !myRoster?.length) return null;

  const senderHeld = heldSet(senderResolved);
  const receiverHeld = heldSet(myRoster);

  // Legacy / no-decision hand: neither side recorded any hold → no honest
  // divergence to name. Silent null (§6).
  if (senderHeld.size === 0 && receiverHeld.size === 0) return null;

  const senderTotal = totalActualFp(senderResolved);
  const receiverTotal = totalActualFp(myRoster);

  let best: Divergence | null = null;

  for (const dealt of initialRoster) {
    const pid = String(dealt.basePlayerId);
    const sHeld = senderHeld.has(pid);
    const rHeld = receiverHeld.has(pid);
    if (sHeld === rHeld) continue; // agreement (both hold or both fade) → not a divergence

    // Exactly one side held the dealt player; read his actual score from the
    // holding side to RANK consequence, then discard it (never stored).
    const holdingRoster = sHeld ? senderResolved : myRoster;
    const holdingTotal = sHeld ? senderTotal : receiverTotal;
    const heldCard = holdingRoster.find((c) => String(c.basePlayerId) === pid);
    const disputedFp = Number(heldCard?.actualFp ?? 0);
    const salience = disputedFp / Math.max(1, holdingTotal); // 0..1, raw fp discarded

    if (!best || salience > best.salience) {
      best = {
        slotIndex: Number(dealt.slotIndex),
        playerId: pid,
        playerName: String(dealt.name),
        senderDecision: sHeld ? "hold" : "fade",
        receiverDecision: rHeld ? "hold" : "fade",
        salience,
      };
    }
  }

  return best;
}

/**
 * One clause that STATES the disagreement — no causal verb, no score. The
 * struct carries no score, so the clause is structurally score-free. Names
 * exactly ONE shared-deal player (default), or zero in the `coincident` case
 * (the base explanation already named + described him — §9 render nit), so the
 * combined surface never re-introduces or double-scores the player.
 *
 * "Mike" mirrors the existing resolution copy convention (resolutionEngine.ts
 * :358 already says "Mike"); the clause sits next to that line.
 */
export function renderDivergenceClause(
  d: Divergence,
  opts?: { coincident?: boolean },
): string {
  const coincident = opts?.coincident === true;
  const receiverHeld = d.receiverDecision === "hold" && d.senderDecision === "fade";
  if (receiverHeld) {
    // You held him; Mike let him go.
    return coincident ? `Mike let him go.` : `You held ${d.playerName}. Mike let him go.`;
  }
  // Mike kept him; you let him go.
  return coincident ? `Mike kept him — you didn't.` : `Mike kept ${d.playerName}. You let him go.`;
}

/**
 * §3 invariant, machine-checkable. A clause is valid iff:
 *   1. d.slotIndex resolves to a slot present in the shared deal (initialRoster).
 *   2. the named identity IS that shared-deal slot player (closes the "one each"
 *      forgery: a clause can't name a player who wasn't dealt at that slot).
 *   3. the decisions re-derive from the real held-sets and genuinely diverge
 *      (tamper guard against a hand-built struct).
 *   4. the rendered clause references AT MOST ONE roster player identity, and if
 *      it names one it is d.playerName. Any second identity → invalid.
 * Fail → caller renders base explanation alone.
 */
export function validateRivalryClause(
  clause: string,
  d: Divergence,
  initialRoster: ReadonlyArray<GeneratedCard>,
  senderResolved: ReadonlyArray<GeneratedCard>,
  myRoster: ReadonlyArray<GeneratedCard>,
): boolean {
  // 1 + 2: the named identity must be the dealt player at d.slotIndex.
  const slot = initialRoster.find((c) => Number(c.slotIndex) === d.slotIndex);
  if (!slot) return false;
  if (String(slot.basePlayerId) !== d.playerId) return false;
  if (String(slot.name) !== d.playerName) return false;

  // 3: re-derive decisions from the real held-sets; must match + diverge.
  const senderHeld = heldSet(senderResolved);
  const receiverHeld = heldSet(myRoster);
  const sDec: Decision = senderHeld.has(d.playerId) ? "hold" : "fade";
  const rDec: Decision = receiverHeld.has(d.playerId) ? "hold" : "fade";
  if (sDec !== d.senderDecision || rDec !== d.receiverDecision) return false;
  if (sDec === rDec) return false;

  // 4: count roster player identities named in the clause. At most one, and it
  //    must be the shared-deal player. Two+ → matchup → invalid.
  const names = new Set<string>();
  for (const r of [initialRoster, senderResolved, myRoster]) {
    for (const c of r) if (c?.name) names.add(String(c.name));
  }
  let namedCount = 0;
  let namedOther = false;
  for (const name of names) {
    if (clause.includes(name)) {
      namedCount++;
      if (name !== d.playerName) namedOther = true;
    }
  }
  if (namedOther) return false;
  if (namedCount > 1) return false;

  return true;
}

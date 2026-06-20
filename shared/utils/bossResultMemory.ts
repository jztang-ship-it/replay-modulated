// shared/utils/bossResultMemory.ts
//
// Phase 2-mount: the user's own boss result, remembered locally. Two consumers:
//   - the results-strip CTA (Step 4) flips from "fight" (unattempted) to
//     progress-memory ("TODAY'S BOSS ✓ — You scored N") when this is present;
//   - the outward ending (Step 5) reconstructs from this on REVISIT — the
//     invariant is owned by the result view, not the resolution transition, so
//     the ending must rebuild whenever the result is viewed, not only once.
//
// Keyed by bossChallengeId (the uuid is stable per day, so it doubles as the
// day key). localStorage only — no server round-trip; presence === attempted.

const KEY = (bossChallengeId: string) => `rm_boss_result_${bossChallengeId}`;

export interface BossResult {
  score: number;
  won: boolean;
}

export function recordBossResult(bossChallengeId: string | null | undefined, r: BossResult): void {
  if (!bossChallengeId) return;
  try {
    localStorage.setItem(KEY(bossChallengeId), JSON.stringify({ score: r.score, won: r.won }));
  } catch {
    /* non-fatal — CTA just stays in the unattempted state */
  }
}

export function getBossResult(bossChallengeId: string | null | undefined): BossResult | null {
  if (!bossChallengeId) return null;
  try {
    const raw = localStorage.getItem(KEY(bossChallengeId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.score !== "number" || typeof p?.won !== "boolean") return null;
    return { score: p.score, won: p.won };
  } catch {
    return null;
  }
}

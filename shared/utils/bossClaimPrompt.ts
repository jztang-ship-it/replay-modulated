// shared/utils/bossClaimPrompt.ts
//
// Local-flag state for the post-win boss claim prompt. No DB. Device-global raw
// localStorage keys (same convention as rm_on_board_today / rm_ever_on_board /
// rm_boss_result_*). The `registered` terminal state is NOT stored here — it's
// read live from useAuth().isAnonymous at the call site (any auth path flips it).
//
// Eligibility: won(current) && !baseline.has(current) && current !== lastPrompted
//              && !registered    (OR ?claim=force in DEV)
//
// AFTER-LAUNCH BASELINE (option b): BossResult carries no timestamp, so we can't
// compare a win-time to a deploy-time. Instead, on first load after this feature
// deploys we snapshot the set of ALREADY-WON boss ids and exclude them forever —
// only genuinely new (post-deploy) boss wins qualify. The daily boss UUID rotates
// (it doubles as the day key), so every new day's boss is a fresh id absent from
// the baseline. ensureClaimBaseline() MUST run BEFORE the current boss's result is
// recorded (recordBossResult fires when BossOutwardEnding mounts at arc-done) —
// call it at the reveal surface's mount, which is the arc START.

const BOSS_RESULT_PREFIX = "rm_boss_result_";
const BASELINE_KEY = "rm_boss_claim_baseline";          // JSON string[] of already-won ids at first load
const BASELINE_GUARD_KEY = "rm_boss_claim_baseline_set"; // set-once "1" (mirrors rm_ever_on_board)
const LAST_PROMPTED_KEY = "rm_last_prompted_boss_id";    // scalar anti-repeat

/** One-time snapshot of already-won boss ids (the after-launch baseline). Idempotent
 *  via the set-once guard. Safe to call on every reveal mount. */
export function ensureClaimBaseline(): void {
  try {
    if (localStorage.getItem(BASELINE_GUARD_KEY) === "1") return;
    const wonIds: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(BOSS_RESULT_PREFIX)) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? "");
        if (v && v.won === true) wonIds.push(k.slice(BOSS_RESULT_PREFIX.length));
      } catch { /* skip malformed entry */ }
    }
    localStorage.setItem(BASELINE_KEY, JSON.stringify(wonIds));
    localStorage.setItem(BASELINE_GUARD_KEY, "1");
  } catch { /* localStorage unavailable — no baseline, eligibility falls through */ }
}

function baselineHas(bossId: string): boolean {
  try {
    const arr = JSON.parse(localStorage.getItem(BASELINE_KEY) ?? "[]");
    return Array.isArray(arr) && arr.includes(bossId);
  } catch { return false; }
}

export function getLastPromptedBossId(): string | null {
  try { return localStorage.getItem(LAST_PROMPTED_KEY); } catch { return null; }
}

export function setLastPromptedBossId(bossId: string): void {
  try { if (bossId) localStorage.setItem(LAST_PROMPTED_KEY, bossId); } catch { /* ignore */ }
}

/** DEV-only force-fire override (mirrors ?reel=force). Short-circuits every gate
 *  so the prompt can be re-glassed without grinding boss wins. Tree-shaken out of
 *  prod via import.meta.env.DEV. */
export function claimForceParam(): boolean {
  try {
    if (!import.meta.env.DEV) return false;
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("claim") === "force";
  } catch { return false; }
}

/** Eligibility for the post-win claim prompt. `won` is the inline live-win
 *  (myScore >= targetScore) — the recorded store backs only the baseline scan.
 *  `registered` = useAuth().isAnonymous === false. */
export function isClaimPromptEligible(args: {
  bossId: string | null | undefined;
  won: boolean;
  registered: boolean;
}): boolean {
  if (claimForceParam()) return true;
  const { bossId, won, registered } = args;
  if (!bossId || !won || registered) return false;
  if (baselineHas(bossId)) return false;
  if (getLastPromptedBossId() === bossId) return false;
  return true;
}

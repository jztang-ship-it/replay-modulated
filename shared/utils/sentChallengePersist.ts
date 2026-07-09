// shared/utils/sentChallengePersist.ts
//
// Cold-boot survival for a MINTED challenge's share sheet. When a challenge is minted the
// ChallengeSentConfirmation sheet is showing; if the user taps an external share target
// (window.open) and mobile Safari HARD-DISCARDS + cold-reloads the tab, all in-memory
// React state is lost and the app boots fresh — the challenge (client state) is gone.
//
// Uses localStorage (NOT sessionStorage): a hard iOS tab-discard can clear sessionStorage,
// which is exactly the mobile external-share case we must survive. Bounded three ways so a
// localStorage entry never leaks into an unrelated later session:
//   - TTL (10 min): the external round-trip is quick; a stale entry expires + self-clears.
//   - burn-on-read: readSentChallenge() clears on read → the restore consumes it once.
//   - clear on dismiss: the in-app ✕ clears it (ChallengeSharePrompt).
//
// PERSISTENCE ONLY — never re-mints, never re-runs createChallenge/settleHeadline; the
// shared_challenges row already exists server-side, we only cache the resulting link.

const KEY = "replaymod_sent_challenge_v1";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface SentChallengeSnapshot {
  shareUrl: string;
  shareHeadline: string;
  sport: string;
}

// Read + validate + TTL-check, WITHOUT burning. Expired entries self-clear.
function readRaw(): SentChallengeSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.shareUrl !== "string" || typeof p.shareHeadline !== "string"
      || typeof p.sport !== "string" || typeof p.ts !== "number") return null;
    if (Date.now() - p.ts > TTL_MS) { clearSentChallenge(); return null; }
    return { shareUrl: p.shareUrl, shareHeadline: p.shareHeadline, sport: p.sport };
  } catch { return null; }
}

export function persistSentChallenge(s: SentChallengeSnapshot): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, ts: Date.now() })); } catch { /* storage unavailable */ }
}

/** Non-burning peek — used to skip the season reel when a restore is pending. */
export function hasSentChallenge(): boolean {
  return readRaw() !== null;
}

/** Burn-on-read: returns the snapshot and clears it (consume-once restore). */
export function readSentChallenge(): SentChallengeSnapshot | null {
  const s = readRaw();
  if (s) clearSentChallenge();
  return s;
}

export function clearSentChallenge(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// shared/utils/sentChallengePersist.ts
//
// Cold-boot survival for a MINTED challenge's share sheet. When a challenge is minted the
// ChallengeSentConfirmation sheet is showing; if the user taps an external share target
// (window.open) and mobile Safari discards + reloads the tab, all in-memory React state is
// lost and the app cold-boots to a fresh deal — the challenge (client state) is gone.
//
// This tab-scoped (sessionStorage — clears on tab close) cache lets App re-show the SAME
// sheet (same link) on cold boot so the challenge stays reachable. PERSISTENCE ONLY — it
// never re-mints and never re-runs createChallenge/settleHeadline; the shared_challenges
// row already exists server-side, we only cache the resulting link to survive a reload.
//
// Lifecycle: persisted whenever the sheet is SHOWN (mint success + reopen), cleared
// whenever it's DISMISSED (in-app ✕) and once consumed on restore — so a later unrelated
// boot never re-shows a stale sheet. Mirrors ResumeShareSurface's sessionStorage pattern.

const KEY = "replaymod_sent_challenge_v1";

export interface SentChallengeSnapshot {
  shareUrl: string;
  shareHeadline: string;
  sport: string;
}

export function persistSentChallenge(s: SentChallengeSnapshot): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function readSentChallenge(): SentChallengeSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.shareUrl === "string" && typeof p.shareHeadline === "string" && typeof p.sport === "string") {
      return { shareUrl: p.shareUrl, shareHeadline: p.shareHeadline, sport: p.sport };
    }
    return null;
  } catch { return null; }
}

export function clearSentChallenge(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

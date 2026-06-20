// shared/components/BossOutwardEnding.tsx
//
// Phase 2-mount Step 5 — the outward ending that seats the invariant: every VIEW
// of a boss result terminates outward, never a bare Play Again.
//
// ONE READ, BOTH SURFACES: this component is the single source. On the post-play
// surface it records the fresh result, then ALWAYS renders from
// getBossResult(bossChallengeId) — so the post-play render and the revisit
// render (BossLandingView, which passes no freshResult) are byte-identical from
// one source.
//
// Copy (locked, decision 3 — enemy-referential, never self-referential):
//   win  → "I beat today's boss." / loss → "The boss got me. Think you survive them?"
// Structure (locked, decision 4): Challenge Someone / Copy Link ABOVE the line,
// Play Again BELOW — Play Again never alone, never deleted. Share = the boss URL
// (recipients fight the SAME boss — the shared-daily mechanism). Share mechanics
// mirror SelfMatchView.handleReshare (navigator.share → clipboard fallback).
//
// Layout is plain in-flow flex (glass-safe scaffold). Device glass at the Gate.

import { useEffect, useState } from "react";
import { recordBossResult, getBossResult, type BossResult } from "@shared/utils/bossResultMemory";
import { track } from "@shared/analytics/analytics";

interface Props {
  sport: string;
  bossChallengeId: string;
  /** Post-play only: the just-played result to record. Omitted on revisit
   *  (the component then renders purely from memory). */
  freshResult?: BossResult;
  /** Play Again — clears the boss + deals a fresh normal hand. */
  onPlayAgain: () => void;
}

export function BossOutwardEnding({ sport, bossChallengeId, freshResult, onPlayAgain }: Props) {
  const [result, setResult] = useState<BossResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Single source: record the fresh result (post-play), then render from
  // getBossResult — guarantees fresh === revisited.
  useEffect(() => {
    if (freshResult) recordBossResult(bossChallengeId, freshResult);
    setResult(getBossResult(bossChallengeId));
  }, [bossChallengeId, freshResult?.score, freshResult?.won]);

  if (!result) return null; // revisit with no memory → caller gates; safety net

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${sport}/challenge/${bossChallengeId}` : "";
  const headline = result.won ? "YOU BEAT TODAY'S BOSS" : "TODAY'S BOSS GOT YOU";
  // Enemy-referential share text (locked copy).
  const shareText = result.won
    ? "I beat today's boss."
    : "The boss got me. Think you survive them?";
  const sub = result.won ? "Can your friends?" : "Think you survive them?";

  function challengeSomeone() {
    if (typeof navigator === "undefined") return;
    track("challenges", "boss_outward_share", { challenge_id: bossChallengeId, sport, won: result!.won });
    if (navigator.share) {
      navigator.share({ title: "ReplayIFS — Today's Boss", text: shareText, url: shareUrl }).catch((err: any) => {
        if (err?.name === "AbortError") return;
        copyLink();
      });
      return;
    }
    copyLink();
  }

  function copyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    track("challenges", "boss_outward_copy", { challenge_id: bossChallengeId, sport, won: result!.won });
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
      .catch(() => { /* ignore */ });
  }

  return (
    <div
      data-testid="boss-outward-ending"
      data-won={result.won ? "true" : "false"}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6 }}
    >
      <div style={{ fontSize: 22, fontWeight: 950, color: "#EAF0FF", letterSpacing: 0.4, textTransform: "uppercase" }}>
        {headline}
      </div>
      <div data-testid="boss-outward-score" style={{ fontSize: 14, color: "rgba(234,240,255,0.7)", fontWeight: 700 }}>
        You scored {result.score.toFixed(1)}
      </div>
      <div style={{ fontSize: 15, color: "#FFB14A", fontWeight: 800, marginBottom: 6 }}>{sub}</div>

      {/* Outward branch — ABOVE the line. */}
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 420 }}>
        <button
          data-testid="boss-challenge-someone"
          onClick={challengeSomeone}
          style={{
            flex: 1, padding: "14px", borderRadius: 12, border: "none",
            background: "#FFB14A", color: "#070A12", fontSize: 15, fontWeight: 900, cursor: "pointer",
          }}
        >
          Challenge Someone
        </button>
        <button
          data-testid="boss-copy-link"
          onClick={copyLink}
          style={{
            flex: 1, padding: "14px", borderRadius: 12, cursor: "pointer",
            background: "transparent", border: "1px solid rgba(255,255,255,0.25)",
            color: "#EAF0FF", fontSize: 15, fontWeight: 800,
          }}
        >
          {copied ? "Link Copied ✓" : "Copy Link"}
        </button>
      </div>

      {/* The line — replay is the spine, branch is above it. */}
      <div style={{ width: "100%", maxWidth: 420, height: 1, background: "rgba(255,255,255,0.14)", margin: "12px 0 4px" }} />

      {/* Play Again — BELOW the line, never alone, never deleted. */}
      <button
        data-testid="boss-play-again"
        onClick={onPlayAgain}
        style={{
          background: "transparent", border: "none", color: "rgba(255,255,255,0.6)",
          fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "8px 12px",
        }}
      >
        Play Again
      </button>
    </div>
  );
}

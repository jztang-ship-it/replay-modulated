// shared/components/BossEntryCta.tsx
//
// Phase 2-mount Step 4 — the boss entry point on the post-results strip.
// Conditional (decision 5, anti-banner-blindness):
//   - boss UNATTEMPTED today → large CTA ("Fight Today's Boss" + N players)
//   - boss ATTEMPTED today    → progress-memory ("TODAY'S BOSS ✓ — You scored N
//     — View Boss"), NOT a second invitation. (Rank line is Phase 2.5.)
//
// Navigation reuses the existing open path: an <a href="/{sport}/challenge/{id}">
// triggers the URL-driven landing → sender_kind:"boss" branch. No new client
// wiring on the open side; no JS router needed; href is glass/SSR/test-safe.
//
// Copy note (build decision): the entry CTA says "Today's Boss" generically —
// the boss's real identity (e.g. "Banner 18") is revealed on the landing. The
// leaderboard GET surfaces only the id + count, not the name; naming the boss in
// the CTA is cheap polish (cache the name in KV alongside the id) deferred unless
// wanted. The locked enemy-referential copy ("the Bulls") applies on the RESULT
// view (Step 5), where the boss name is in challengeCtx.
//
// Layout reuses plain in-flow flex (no transforms / scale / absolute) — the
// glass-safe scaffold rule. Device glass at the phase Gate.

import { getBossResult } from "@shared/utils/bossResultMemory";

interface Props {
  sport: string;
  bossChallengeId: string;
  /** Distinct players who tried today's boss; null/0 → count line omitted (Upgrade). */
  bossPlayerCount: number | null;
}

export function BossEntryCta({ sport, bossChallengeId, bossPlayerCount }: Props) {
  const prior = getBossResult(bossChallengeId);
  const href = `/${sport}/challenge/${bossChallengeId}`;
  // COPY CONSTRAINT (locked): the count is PLAYERS, never attempts.
  const countLine =
    bossPlayerCount != null && bossPlayerCount > 0
      ? `${bossPlayerCount.toLocaleString()} players tried`
      : null;

  if (prior) {
    // ATTEMPTED — progress memory, not a re-invitation.
    return (
      <div
        data-testid="boss-entry-attempted"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          flexWrap: "wrap", margin: "12px 0 4px", padding: "10px 14px",
          borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)", color: "rgba(234,240,255,0.85)",
          fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textAlign: "center",
        }}
      >
        <span>TODAY'S BOSS ✓ — You scored {prior.score.toFixed(1)}</span>
        <a
          data-testid="boss-view-link"
          href={href}
          style={{ color: "#FFB14A", fontWeight: 900, textDecoration: "none" }}
        >
          View Boss →
        </a>
      </div>
    );
  }

  // UNATTEMPTED — large CTA.
  return (
    <a
      data-testid="boss-entry-cta"
      href={href}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        margin: "12px 0 4px", padding: "16px", borderRadius: 14,
        background: "#FFB14A", color: "#070A12", textDecoration: "none",
        fontWeight: 950, textAlign: "center",
      }}
    >
      <span style={{ fontSize: 17, letterSpacing: 0.5, textTransform: "uppercase" }}>
        Fight Today's Boss
      </span>
      {countLine && (
        <span data-testid="boss-entry-count" style={{ fontSize: 12, fontWeight: 700, opacity: 0.78 }}>
          {countLine} — can you top them?
        </span>
      )}
    </a>
  );
}

// shared/components/ChallengeSharePrompt.tsx
import { useMemo, useState } from "react";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";
import { useChallengeShare } from "@shared/hooks/useChallengeShare";
import { getNickname } from "@shared/utils/playerIdentity";
import { track } from "@shared/analytics/analytics";
import { selectChallengeInitiation } from "@shared/commentary/chadChallenge";

interface Props {
  sport: string;
  season: string;
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
  initialRoster: GeneratedCard[];
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  winTiersMap: WinTierMap;
  serializeRoster: (cards: GeneratedCard[]) => Record<string, unknown>;
  triggerResult: TriggerResult;
  /** Caption stored on the challenge (big-game or season-reel copy).
   *  Rendered on the landing page and the share-card PNG. */
  shareHeadline?: string;
  /** When set, the prompt is in rivalry-continuation mode (the player
   *  just beat a challenge and is sending a back-fire from a fresh
   *  hand). Surfaces "Send to {name}" framing instead of generic
   *  trigger labels. null → use existing trigger-driven copy. */
  rivalryTargetName?: string | null;
  onDismiss?: () => void;
}

export function ChallengeSharePrompt({
  sport, season, totalFp, winTier, roster, initialRoster,
  badges, winTiersMap, serializeRoster, triggerResult, shareHeadline,
  rivalryTargetName, onDismiss,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { isCreating, challengeId, error, createChallenge, shareChallenge } = useChallengeShare(sport);

  // Rivalry-back mode forces the prominent prompt regardless of the
  // underlying trigger (default-trigger fresh hands would otherwise
  // render as the small corner icon).
  const isRivalryBack = !!rivalryTargetName || (triggerResult.trigger as string) === "rivalry_back";
  const isSpecial = isRivalryBack || triggerResult.trigger !== "default";

  // Rare-pull headline: when the trigger evaluator threaded anchor data
  // through (anchorBasePlayerId + topGameTier), look up the anchor card
  // in roster and ask selectChallengeInitiation for an anchor-aware line
  // from the INITIATION_RARE_PULL bank. Replaces the static
  // triggerResult.headline ("You pulled a legendary game...") that the
  // evaluator ships as a fallback for callers without this wiring.
  //
  // Anchor identity uses basePlayerId not cardId because topGameInfo's
  // star object (in GameView) only carries basePlayerId. A slate doesn't
  // double-up players, so this lookup is unambiguous.
  //
  // useMemo so the line is stable across re-renders within a single hand
  // — recomputing would change the picked line on every parent re-render,
  // which would burn the anti-repeat history and surface different copy
  // on each render of the same hand.
  const rarePullHeadline = useMemo(() => {
    if (triggerResult.trigger !== "rare_pull") return null;
    if (!triggerResult.anchorBasePlayerId || !triggerResult.topGameTier) return null;
    const anchor = roster.find(c => c.basePlayerId === triggerResult.anchorBasePlayerId);
    if (!anchor) return null;
    // lastName extraction matches the existing commentary-layer convention
    // (templateResolver.ts lastName(name) — split on whitespace, take last).
    const last = String(anchor.name ?? "").trim().split(/\s+/).pop() ?? anchor.name ?? "";
    return selectChallengeInitiation({
      winTier,
      roster: roster as Array<{ tier?: string; wasHeld?: boolean }>,
      topGameTier: triggerResult.topGameTier,
      starName: last,
      starHadMeaningfulPerformance: true,
      starAchievementType: triggerResult.topGameTier,
      starAnchorFp: anchor.actualFp,
      starProjectedFp: anchor.projectedFp,
    });
  }, [triggerResult.trigger, triggerResult.anchorBasePlayerId, triggerResult.topGameTier, roster, winTier]);

  const headlineText = rarePullHeadline ?? triggerResult.headline;

  async function handleChallenge() {
    track("challenges", "challenge_create", { sport, trigger: triggerResult.trigger });
    let cid = challengeId;
    if (!cid) {
      cid = await createChallenge({
        handId: crypto.randomUUID(),
        sport, season, totalFp, winTier, roster, initialRoster, badges, winTiersMap,
        challengerName: getNickname() || "Anonymous",
        serializeRoster,
        shareHeadline,
        // Pass the pre-evaluated trigger through so the DB row's
        // trigger_type matches what fired on the prompt. Without this,
        // useChallengeShare's re-evaluation misses topGameTier and
        // rare_pull hands record as default.
        triggerResult,
      });
    }
    if (!cid) return;
    const url = `${window.location.origin}/${sport}/challenge/${cid}`;
    // Share text is the recipient-facing chad trash-talk (same string
    // stored as share_headline on the DB row, propagated to the landing
    // screen + OG card). Falls back to the poster-facing prompt
    // headline only when shareHeadline is missing — preserves
    // pre-trash-talk-wiring behavior for sports without
    // adapter.getShareHeadline implemented.
    await shareChallenge(shareHeadline ?? triggerResult.headline, url, "");
    if (!navigator.share) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const TRIGGER_LABEL: Record<string, string> = {
    rare_pull: "⚡ RARE PULL", big_score: "🔥 BIG SCORE",
    near_miss: "😤 NEAR MISS", bad_beat: "💀 BAD BEAT",
  };

  // Default trigger: render a small corner icon only — discoverable for
  // users who want to share a mid hand, but not pushed on them. Named
  // triggers (rare_pull / big_score / near_miss / bad_beat) keep the
  // prominent share strip.
  if (!isSpecial) {
    return (
      <button
        onClick={handleChallenge}
        disabled={isCreating}
        aria-label="Challenge a friend with this hand"
        style={{
          position: "fixed",
          right: 14,
          bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
          zIndex: 9000,
          width: 40, height: 40, borderRadius: 20,
          background: "rgba(255,177,74,0.14)",
          border: "1px solid rgba(255,177,74,0.4)",
          color: "#FFB14A", fontSize: 18, fontWeight: 900,
          cursor: isCreating ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}
      >
        {isCreating ? "…" : copied ? "✓" : "↗"}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
      background: "linear-gradient(0deg, #0D1628 0%, rgba(13,22,40,0.97) 100%)",
      borderTop: `1px solid rgba(255,177,74,0.3)`,
      padding: "14px 20px max(24px, env(safe-area-inset-bottom, 20px))",
    }}>
      {/* Header row: label + dismiss */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isSpecial ? "#FFB14A" : "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>
          {isRivalryBack
            ? `↩ CHALLENGE ${(rivalryTargetName ?? "Your Friend").toUpperCase()} BACK`
            : isSpecial ? TRIGGER_LABEL[triggerResult.trigger] ?? "CHALLENGE" : "CHALLENGE A FRIEND"}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: "none", border: "none", padding: "2px 4px",
              color: "rgba(255,255,255,0.35)", fontSize: 18, cursor: "pointer", lineHeight: 1,
            }}
            aria-label="Dismiss"
          >✕</button>
        )}
      </div>
      {isSpecial && (
        <div style={{ fontSize: 14, color: "#EAF0FF", marginBottom: 12, lineHeight: 1.4 }}>
          {isRivalryBack
            ? `${totalFp.toFixed(1)} FP on a fresh slate. Send it to ${rivalryTargetName ?? "your friend"}.`
            : headlineText}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>
          Failed to create challenge — make sure you're signed in.
        </div>
      )}
      <button
        onClick={handleChallenge}
        disabled={isCreating}
        style={{
          width: "100%", padding: isSpecial ? "14px" : "10px", borderRadius: 12,
          background: isCreating ? "rgba(255,177,74,0.3)" : isSpecial ? "#FFB14A" : "rgba(255,177,74,0.12)",
          border: isSpecial ? "none" : "1px solid rgba(255,177,74,0.4)",
          color: isSpecial ? "#070A12" : "#FFB14A",
          fontSize: isSpecial ? 15 : 13, fontWeight: 900,
          cursor: isCreating ? "default" : "pointer", letterSpacing: 0.5,
        }}
      >
        {isCreating
          ? "Creating..."
          : copied
            ? "Link Copied! ✓"
            : isRivalryBack
              ? `Send to ${rivalryTargetName ?? "your friend"}`
              : "Challenge a Friend"}
      </button>
    </div>
  );
}

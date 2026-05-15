// shared/components/ChallengeSharePrompt.tsx
import { useState } from "react";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";
import { useChallengeShare } from "@shared/hooks/useChallengeShare";
import { getNickname } from "@shared/utils/playerIdentity";
import { track } from "@shared/analytics/analytics";

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
  onDismiss?: () => void;
}

export function ChallengeSharePrompt({
  sport, season, totalFp, winTier, roster, initialRoster,
  badges, winTiersMap, serializeRoster, triggerResult, shareHeadline, onDismiss,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { isCreating, challengeId, error, createChallenge, shareChallenge } = useChallengeShare(sport);

  const isSpecial = triggerResult.trigger !== "default";

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
      });
    }
    if (!cid) return;
    const url = `${window.location.origin}/${sport}/challenge/${cid}`;
    await shareChallenge(triggerResult.headline, url, "");
    if (!navigator.share) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const TRIGGER_LABEL: Record<string, string> = {
    rare_pull: "⚡ RARE PULL", big_score: "🔥 BIG SCORE",
    near_miss: "😤 NEAR MISS", bad_beat: "💀 BAD BEAT",
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
      background: "linear-gradient(0deg, #0D1628 0%, rgba(13,22,40,0.97) 100%)",
      borderTop: `1px solid ${isSpecial ? "rgba(255,177,74,0.3)" : "rgba(255,255,255,0.08)"}`,
      padding: "14px 20px max(24px, env(safe-area-inset-bottom, 20px))",
    }}>
      {/* Header row: label + dismiss */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isSpecial ? "#FFB14A" : "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>
          {isSpecial ? TRIGGER_LABEL[triggerResult.trigger] ?? "CHALLENGE" : "CHALLENGE A FRIEND"}
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
          {triggerResult.headline}
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
        {isCreating ? "Creating..." : copied ? "Link Copied! ✓" : "Challenge a Friend"}
      </button>
    </div>
  );
}

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
}

export function ChallengeSharePrompt({
  sport, season, totalFp, winTier, roster, initialRoster,
  badges, winTiersMap, serializeRoster, triggerResult,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { isCreating, challengeId, createChallenge, shareChallenge } = useChallengeShare(sport);

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

  if (isSpecial) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
        background: "linear-gradient(0deg, #0D1628 0%, rgba(13,22,40,0.97) 100%)",
        borderTop: "1px solid rgba(255,177,74,0.3)",
        padding: "16px 20px 24px",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#FFB14A", marginBottom: 6, letterSpacing: 0.5 }}>
          {triggerResult.trigger === "rare_pull" ? "⚡ RARE PULL" :
           triggerResult.trigger === "big_score" ? "🔥 BIG SCORE" :
           triggerResult.trigger === "near_miss" ? "😤 NEAR MISS" : "💀 BAD BEAT"}
        </div>
        <div style={{ fontSize: 15, color: "#EAF0FF", marginBottom: 14, lineHeight: 1.4 }}>
          {triggerResult.headline}
        </div>
        <button
          onClick={handleChallenge}
          disabled={isCreating}
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: isCreating ? "rgba(255,177,74,0.3)" : "#FFB14A",
            border: "none", color: "#070A12", fontSize: 15, fontWeight: 900,
            cursor: isCreating ? "default" : "pointer", letterSpacing: 0.5,
          }}
        >
          {isCreating ? "Creating..." : copied ? "Link Copied!" : "Challenge a Friend"}
        </button>
      </div>
    );
  }

  // Default trigger — subtle presentation
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
      <button
        onClick={handleChallenge}
        disabled={isCreating}
        style={{
          padding: "8px 20px", borderRadius: 8,
          background: "transparent",
          border: "1px solid rgba(255,177,74,0.4)",
          color: "#FFB14A", fontSize: 13, fontWeight: 700,
          cursor: isCreating ? "default" : "pointer",
        }}
      >
        {isCreating ? "..." : copied ? "Link Copied!" : "Challenge a Friend"}
      </button>
    </div>
  );
}

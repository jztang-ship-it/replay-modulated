import { useEffect, useRef } from "react";
import { track, setProduct } from "./analytics";

export type AnalyticsSport = "basketball" | "worldcup" | "football" | "nfl" | "hockey" | "baseball" | "mma";

const TIER_THRESHOLDS: Record<AnalyticsSport, number[]> = {
  basketball: [190, 205, 225, 235, 255],  // ROOKIE, STARTER, ALL_STAR, MVP, LEGEND — must sync with payoutLogic.ts
  worldcup:   [155, 180, 200, 230],
  football:   [135, 160, 180, 205],
  nfl:        [135, 160, 180, 205],
  hockey:     [135, 160, 180, 205],
  baseball:   [135, 160, 180, 205],
  mma:        [135, 160, 180, 205],
};

const SO_CLOSE_GAP = 5;

export function useGameAnalytics(sport: AnalyticsSport) {
  const sessionStartRef = useRef<number>(Date.now());
  const handsPlayedRef  = useRef<number>(0);
  const sessionScoreRef = useRef<number>(0);

  useEffect(() => {
    setProduct(sport);
    track("system", "app_opened", { sport, platform: "web" });
    sessionStartRef.current = Date.now();
  }, [sport]);

  return {
    handDealt(roster: any[]) {
      const cost = roster.reduce((s: number, c: any) => s + Number(c?.salary ?? 0), 0);
      track("gameplay", "hand_dealt", { sport, rosterCost: cost, playerCount: roster.length });
    },
    cardHeld(card: any) {
      track("gameplay", "card_held", {
        sport,
        position: String(card?.position ?? ""),
        tier:     String(card?.tier ?? ""),
        salary:   Number(card?.salary ?? 0),
      });
    },
    handResolved(totalFp: number, tier: string, bust: boolean, badgeCount: number, duration_ms: number) {
      handsPlayedRef.current += 1;
      sessionScoreRef.current += totalFp;
      track("gameplay", "hand_resolved", { sport, score: Math.round(totalFp * 10) / 10, tier, bust, badgeCount, duration_ms });
      const thresholds = TIER_THRESHOLDS[sport] ?? [];
      const nextTierFp = thresholds.find(t => t > totalFp);
      if (nextTierFp !== undefined && (nextTierFp - totalFp) <= SO_CLOSE_GAP) {
        track("gameplay", "so_close", { sport, currentFp: Math.round(totalFp * 10) / 10, nextTierFp, gapFp: Math.round((nextTierFp - totalFp) * 10) / 10 });
      }
    },
    redrawUsed() {
      track("gameplay", "redraw_used", { sport });
    },
    ftueCompleted() {
      track("gameplay", "ftue_completed", { sport });
    },
    sessionEnd() {
      const duration_ms = Date.now() - sessionStartRef.current;
      track("gameplay", "session_end", { sport, handsPlayed: handsPlayedRef.current, duration_ms, totalScore: Math.round(sessionScoreRef.current * 10) / 10 });
      sessionStartRef.current = Date.now();
      handsPlayedRef.current  = 0;
      sessionScoreRef.current = 0;
    },
  };
}

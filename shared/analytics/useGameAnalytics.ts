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

// ── Lightweight traffic source capture (runs once per page load) ──────────
function getTrafficSource(): Record<string, string> {
  try {
    const params = new URLSearchParams(window.location.search);
    const props: Record<string, string> = {};
    const utm_source = params.get("utm_source");
    const utm_campaign = params.get("utm_campaign");
    const utm_medium = params.get("utm_medium");
    if (utm_source) props.utm_source = utm_source;
    if (utm_campaign) props.utm_campaign = utm_campaign;
    if (utm_medium) props.utm_medium = utm_medium;
    if (document.referrer) props.referrer = document.referrer;
    return props;
  } catch { return {}; }
}

// ── New vs returning user detection (localStorage-based, lightweight) ─────
function getUserStatus(): { user_status: "new" | "returning"; first_seen_at: string; hand_count_lifetime: number } {
  try {
    const firstSeenKey = "rm_first_seen_at";
    const now = new Date().toISOString();
    let firstSeen = localStorage.getItem(firstSeenKey);
    const isNew = !firstSeen;
    if (!firstSeen) {
      firstSeen = now;
      localStorage.setItem(firstSeenKey, firstSeen);
    }
    const handCount = parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10);
    return {
      user_status: isNew ? "new" : "returning",
      first_seen_at: firstSeen,
      hand_count_lifetime: handCount,
    };
  } catch {
    return { user_status: "new", first_seen_at: "", hand_count_lifetime: 0 };
  }
}

export function useGameAnalytics(sport: AnalyticsSport) {
  const sessionStartRef = useRef<number>(Date.now());
  const handsPlayedRef  = useRef<number>(0);
  const sessionScoreRef = useRef<number>(0);
  const firstHandDealtRef  = useRef(false);
  const firstHandResolvedRef = useRef(false);

  useEffect(() => {
    setProduct(sport);

    const userStatus = getUserStatus();
    const trafficSource = getTrafficSource();
    const ftueState = localStorage.getItem(`replaymod_ftue_${sport}`) === "1" ? "completed" : "active";

    // session_start — once per mount (app session)
    track("system", "session_start", {
      sport,
      platform: "web",
      ftue_state: ftueState,
      ...userStatus,
      ...trafficSource,
    });

    // app_loaded — kept for backwards compat with existing app_opened
    track("system", "app_opened", { sport, platform: "web", ...userStatus, ...trafficSource });

    // ftue_started — only if user is in FTUE at session start
    if (ftueState === "active") {
      track("gameplay", "ftue_started", { sport });
    }

    sessionStartRef.current = Date.now();
  }, [sport]);

  return {
    handDealt(roster: any[], extra?: { isFTUE?: boolean }) {
      const cost = roster.reduce((s: number, c: any) => s + Number(c?.salary ?? 0), 0);
      track("gameplay", "hand_dealt", { sport, rosterCost: cost, playerCount: roster.length, ftue_hand: !!(extra?.isFTUE) });

      // first_hand_dealt — fires once per session
      if (!firstHandDealtRef.current) {
        firstHandDealtRef.current = true;
        track("gameplay", "first_hand_dealt", { sport, ftue_hand: !!(extra?.isFTUE) });
      }
    },
    cardHeld(card: any) {
      track("gameplay", "card_held", {
        sport,
        position: String(card?.position ?? ""),
        tier:     String(card?.tier ?? ""),
        salary:   Number(card?.salary ?? 0),
      });
    },
    handResolved(
      totalFp: number, tier: string, bust: boolean, badgeCount: number, duration_ms: number,
      extra?: { holdCount?: number; isFTUE?: boolean },
    ) {
      handsPlayedRef.current += 1;
      sessionScoreRef.current += totalFp;

      const thresholds = TIER_THRESHOLDS[sport] ?? [];
      const nextTierFp = thresholds.find(t => t > totalFp);
      const nearMiss = nextTierFp !== undefined && (nextTierFp - totalFp) <= SO_CLOSE_GAP;

      track("gameplay", "hand_resolved", {
        sport,
        score: Math.round(totalFp * 10) / 10,
        tier,
        bust,
        badgeCount,
        duration_ms,
        did_win: !bust,
        did_near_miss: nearMiss,
        hold_count: extra?.holdCount ?? null,
        ftue_hand: !!(extra?.isFTUE),
        server_resolved: true,
      });

      if (nearMiss && nextTierFp !== undefined) {
        track("gameplay", "so_close", { sport, currentFp: Math.round(totalFp * 10) / 10, nextTierFp, gapFp: Math.round((nextTierFp - totalFp) * 10) / 10 });
      }

      // first_hand_resolved — fires once per session
      if (!firstHandResolvedRef.current) {
        firstHandResolvedRef.current = true;
        track("gameplay", "first_hand_resolved", { sport, score: Math.round(totalFp * 10) / 10, tier, bust, ftue_hand: !!(extra?.isFTUE) });
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
